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
        .get(`${conf.apiUrl}/v1/rooms`)
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
