/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * src/socketInit.js
 *
 * Handle client connections.
 */
const debug = require('debug')('refocus-real-time:sockets');
const jwt = require('jsonwebtoken');
const Promise = require('bluebird');
const conf = require('../conf/config');
const ipWhitelistUtils = require('../util/ipWhitelistUtils');

const jwtVerifyAsync = Promise.promisify(jwt.verify);

module.exports = (io) => {
  io.sockets.on('connection', (socket) => {
    Promise.resolve()
    .then(() => {
      const ipAddress = ipWhitelistUtils.getIpAddressFromSocket(socket);
      return ipWhitelistUtils.isWhitelisted(ipAddress);
    })
    .then((allowed) => {
      if (!allowed) {
        throw new Error('Access denied: ip not allowed');
      }

      const token = socket.handshake.query && socket.handshake.query.t;
      if (!token) {
        throw new Error('Access denied: no token provided');
      }

      return jwtVerifyAsync(socket.handshake.query.t, conf.secret);
    })
    .catch((err) => {
      console.error('Verify Error %O', err);
      socket.disconnect();
    });
  });
};
