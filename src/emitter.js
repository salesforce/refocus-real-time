/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * src/emitter.js
 *
 * Filter and emit events to connected clients.
 */
const debug = require('debug')('refocus-real-time:emitter');
const utils = require('../util/emitUtils');
const initEvent = {
  bot: 'refocus.internal.realtime.bot.namespace.initialize',
  perspective: 'refocus.internal.realtime.perspective.namespace.initialize',
};

module.exports = (io, key, obj, pubOpts) => {
  // newObjectAsString contains { key: {new: obj }}
  const newObjectAsString = utils.getNewObjAsString(key, obj);

  // Initialize namespace if init event is sent for perspective or bot
  if (key.startsWith(initEvent.perspective)) {
    utils.initializePerspectiveNamespace(obj, io);
  } else if (key.startsWith(initEvent.bot)) {
    utils.initializeBotNamespace(obj, io);
  }

  /*
   * Socket.io does not expose any API to retrieve list of all the namespaces
   * which have been initialized. We use `Object.keys(io.nsps)` here, which
   * gives us an array of all the namespace names, where each namespace name
   * is a string which encodes the perspective/room filters neeeded to match
   * this real-time event to the perspectives/rooms to which it should be
   * emitted.
   */
  Object.keys(io.nsps).forEach((n) => {
    const namespace = io.of(n); // Load the namespace from socket.io

    /*
     * Emit this event only if *this* namespace in *this* process has one or
     * more connected clients, e.g. at least one user has this perspective or
     * room open in a browser.
     *
     * Ref. https://socket.io/docs/server-api/#namespace-connected.
     */
    const connections = Object.keys(namespace.connected);
    if (connections.length > 0) {
      /* Check the perspective/room filters before emitting. */
      if (utils.shouldIEmitThisObj(n, obj, pubOpts)) {
        namespace.emit(key, newObjectAsString);
      }
    }
  });
};
