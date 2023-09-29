/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * src/subscriberInit.js
 *
 * Subscribe to pubSub messages and pass them through to the emitter.
 */
const debug = require('debug')('refocus-real-time:subscriber');
const redis = require('redis');
const featureToggles = require('feature-toggles');
const conf = require('../conf/config');
const emitUtils = require('./util/emitUtils');
const pubSubStats = require('./util/pubSubStats');
const emitter = require('./emitter');

const tlsOptions = {
  rejectUnauthorized: false,
};

const clients = {
  bots: [],
  perspectives: [],
};

module.exports = {
  init(io) {
    conf.pubSubPerspectives
    .map((url) => redis.createClient({url: url, tls: tlsOptions}))
    .forEach((client) => {
      clients.perspectives.push(client);
      client.subscribe(conf.perspectiveChannel);
      client.on('message', emitMessage);
    });

    conf.pubSubBots.map((url) => redis.createClient({url: url, tls: tlsOptions}))
      .forEach((client) => {
        clients.bots.push(client);
        client.subscribe(conf.botChannel);
        client.on('message', emitMessage);
      });

    return clients;

    function emitMessage(channel, messageAsString) {
      const obj = JSON.parse(messageAsString);
      const key = Object.keys(obj)[0];
      const parsedObj = emitUtils.parseObject(obj[key], key);
      const {pubOpts} = parsedObj;

      // Deleting pubOpts from parsedObj before passing it to the emitter
      delete parsedObj.pubOpts;
      pubSubStats.trackSubscribe(key, parsedObj);

      /*
       * pass on the message received through the redis subscriber to the socket
       * io emitter to send data to the browser clients.
       */
      emitter(io, key, parsedObj, pubOpts);
    }
  },

  cleanup() {
    ['bots', 'perspectives']
      .forEach((type) => clients[type].forEach(c => c.quit()));
  },
};

