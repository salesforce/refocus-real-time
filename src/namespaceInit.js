const debug = require('debug')('refocus-real-time:namespaces');
const req = require('superagent');
const Promise = require('bluebird');
const utils = require('../util/emitUtils');
const conf = require('../conf/config');

module.exports = (io) => {
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
};
