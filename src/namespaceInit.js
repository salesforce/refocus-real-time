/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * src/namespaceInit.js
 *
 * Initialize the namespaces for clients to connect to.
 */
const debug = require('debug')('refocus-real-time:namespaces');
const req = require('superagent');
const Promise = require('bluebird');
const toggle = require('feature-toggles');
const utils = require('../util/emitUtils');
const conf = require('../conf/config');

module.exports = (io) => {
  // NEW
  if (toggle.isFeatureEnabled('useNewNamespaceFormat')) {
    utils.initializeNamespace('/bots', io);
    utils.initializeNamespace('/rooms', io);
    utils.initializeNamespace('/perspectives', io);
    return Promise.resolve();
  }

  // OLD
  if (toggle.isFeatureEnabled('useOldNamespaceFormat')) {
    return Promise.join(
      req
        .get(`${conf.apiUrl}/v1/perspectives`)
        .set('Authorization', conf.apiToken),
      req
      .get(`${conf.apiUrl}/v1/rooms?active=true`)
        .set('Authorization', conf.apiToken),
    )
    .then(([perspectivesResponse, roomsResponse]) => {
      perspectivesResponse.body.forEach((p) =>
        utils.initializePerspectiveNamespace(p, io)
      );
      roomsResponse.body.forEach((r) =>
        utils.initializeBotNamespace(r, io)
      );
    });
  }
};
