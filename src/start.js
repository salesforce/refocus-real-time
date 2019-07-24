/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * start.js
 *
 * Set up socket.io and redis subscriber to receive events and emit to clients.
 */
const toggle = require('feature-toggles');
const conf = require('../conf/config');
const namespaceInit = require('./namespaceInit');
const subscriberInit = require('./subscriberInit');
const pubSubStats = require('./util/pubSubStats');

let io;
let interval;

module.exports = {
  start(clusterProcessId = 0) {
    Object.entries(conf).forEach(([key, val]) => {
      if (val === undefined) throw new Error(`Config variable "${key}" is required.`);
    });

    const processName = `${conf.dyno ? `${conf.dyno}:${clusterProcessId}` : clusterProcessId}`;
    io = require('socket.io')(conf.port);

    if (
      toggle.isFeatureEnabled('enableSubscribeStats')
      || toggle.isFeatureEnabled('enableEmitStats')
      || toggle.isFeatureEnabled('enableClientStats')
      || toggle.isFeatureEnabled('enableConnectionStats')
    ) {
      interval = setInterval(
        () => pubSubStats.log(processName, io),
        conf.pubSubStatsLoggingInterval
      );
    }

    namespaceInit(io)
    .then(() => subscriberInit.init(io));
  },

  stop() {
    io.close();
    clearInterval(interval);
    subscriberInit.cleanup();
  },
};
