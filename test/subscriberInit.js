/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/subscriberInit.js
 *
 * NOTE: Run with NODE_DEBUG=redis to see all the redis debug :)
 */
'use strict'; // eslint-disable-line strict
const path = require('path');
const redis = require('redis');
const expect = require('chai').expect;
const uncache = require('./uncache');

const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const publisher = redis.createClient('//127.0.0.1:6379');

describe('tests/subscriberInit.js >', () => {
  after(() => publisher.quit());

  /*
   * NOTE: Assume there is a REDIS_URL env var
   */
  describe('perspectives', () => {
    let hasOwnRedisUrl = false;
    let conf;
    let sub;

    before(() => {
      uncache('../conf/config');
      uncache('../src/subscriberInit');
      process.env.REDIS_PUBSUB_PERSPECTIVES = 'REDIS_URL';
      if (process.env.hasOwnProperty(REDIS_URL)) {
        hasOwnRedisUrl = true;
      } else {
        process.env.REDIS_URL = '//127.0.0.1:6379';
      }

      conf = require('../conf/config');
      sub = require('../src/subscriberInit');
    });

    after(() => {
      uncache('../conf/config');
      uncache('../src/subscriberInit');
      delete process.env.REDIS_PUBSUB_PERSPECTIVES;
      sub.cleanup();
      if (!hasOwnRedisUrl) {
        delete process.env.REDIS_URL;
      }
    });

    it('OK', () => {
      const counter = {
        focus: [],
        imc: [],
      };

      const clients = sub.init(null, 'MyProcess');
      clients.perspectives[0].on('message', (ch, msg) => counter[ch].push(msg));
      expect(clients.perspectives.length).to.eql(1);
      const c0 = clients.perspectives[0];
      expect(c0).to.have.property('address', '127.0.0.1:6379');

      expect(clients.bots.length).to.eql(0);

      for (let i = 0; i < 10; i++) {
        publisher.publish(conf.perspectiveChannel,
          JSON.stringify({HelloPerspective: i}));
      }

      setTimeout(() => {
        expect(counter.focus).to.have.length(10);
      }, 40);
    });
  });

  describe('bots', () => {
    let conf;
    let sub;

    before(() => {
      uncache('../conf/config');
      uncache('../src/subscriberInit');
      process.env.REDIS_PUBSUB_BOTS = 'REDIS_URL';
      if (process.env.hasOwnProperty(REDIS_URL)) {
        hasOwnRedisUrl = true;
      } else {
        process.env.REDIS_URL = '//127.0.0.1:6379';
      }

      conf = require('../conf/config');
      sub = require('../src/subscriberInit');
    });

    after(() => {
      uncache('../conf/config');
      uncache('../src/subscriberInit');
      delete process.env.REDIS_PUBSUB_BOTS;
      delete process.env.REDIS_URL;
      publisher.quit();
      sub.cleanup();
      if (!hasOwnRedisUrl) {
        delete process.env.REDIS_URL;
      }
    });

    it('OK', () => {
      const counter = {
        focus: [],
        imc: [],
      };

      const clients = sub.init(null, 'MyProcess');
      clients.bots[0].on('message', (ch, msg) => counter[ch].push(msg));
      expect(clients.bots.length).to.eql(1);
      const c0 = clients.bots[0];
      expect(c0).to.have.property('address', '127.0.0.1:6379');

      expect(clients.perspectives.length).to.eql(0);

      for (let i = 0; i < 10; i++) {
        publisher.publish(conf.botChannel, JSON.stringify({HelloBot: i}));
      }

      setTimeout(() => {
        expect(counter.imc).to.have.length(10);
      }, 40);
    });
  });
});
