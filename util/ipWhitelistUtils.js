/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * util/ipWhitelistUtils.js
 *
 * Uses the refocus-whitelist service defined in `conf.ipWhitelistService`
 * (which is based on env var `IP_WHITELIST_SERVICE`).
 *
 * Rejects multiple IP addresses as unauthorized.
 */
const request = require('superagent');
const conf = require('../conf/config');
const path = 'v1/verify';
const XFWD = 'x-forwarded-for';

/**
 * Resolves to true if the `addr` arg is a valid and whitelisted IP address.
 *
 * @param {String} addr - the IP address to test
 * @returns {Promise<Boolean>} true if the `addr` arg is a valid and
 *  whitelisted IP address
 */
function isWhitelisted(addr) {
  if (conf.ipWhitelistService) {
    return request.get(`${conf.ipWhitelistService}/${path}/${addr}`)
    .then((_res) => _res.body.allow)
    .catch((err) => {
      if (err.status === 400) {
        return false;
      }

      throw new Error('refocus-whitelist error');
    });
  } else {
    return Promise.resolve(true);
  }
} // isWhitelisted


/**
 * Determines the ip address origin of the socket connection based on either
 * the socket handshake's "x-forwarded-for" header or the socket handshake's
 * address, and returns the ip address to the caller.
 *
 * @param {request} socket - socket.io object
 * @returns {*} a string representing the ip address
 * @throws {Error} if the ip address couldn't be identified
 */
function getIpAddressFromSocket(socket) {
  if (!socket || !socket.handshake) throw new Error('could not identify ip address');

  // From socket handshake's "x-forwarded-for" header?
  if (socket.handshake.headers && socket.handshake.headers[XFWD]) {
    return socket.handshake.headers[XFWD];
  }

  // From socket handshake's address?
  if (socket.handshake.address) {
    return socket.handshake.address;
  }

  throw new Error('could not identify ip address');
}; // getIpAddressFromSocket

module.exports = {
  isWhitelisted,
  getIpAddressFromSocket,
};

