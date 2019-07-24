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
const toggle = require('feature-toggles');
const u = require('./util/emitUtils');
const eventTypeIndex = 3;
const initEvent = {
  bot: 'refocus.internal.realtime.bot.namespace.initialize',
  perspective: 'refocus.internal.realtime.perspective.namespace.initialize',
};

module.exports = (io, key, obj, pubOpts) => {
  const eventType = key.split('.')[eventTypeIndex];

  // NEW
  if (toggle.isFeatureEnabled('useNewNamespaceFormat')) {
    if (eventType === 'subject' || eventType === 'sample') {
      const perspectives = Array.from(u.connectedRooms['/perspectives']).filter((roomName) =>
        u.shouldIEmitThisObj(roomName, obj)
      );
      u.emitToClients(io, '/perspectives', perspectives, key, obj);
    } else if (eventType === 'bot') {
      const rooms = [obj.roomId];
      const bots = [obj.botId];
      u.emitToClients(io, '/rooms', rooms , key, obj);
      u.emitToClients(io, '/bots', bots  , key, obj);
    } else if (eventType === 'room') {
      const rooms = [obj.id];
      const bots = obj.type && obj.type.bots && obj.type.bots.map(bot => bot.id);
      u.emitToClients(io, '/rooms', rooms, key, obj);
      u.emitToClients(io, '/bots', bots , key, obj);
    }
  }

  // OLD
  // Initialize namespace if init event is sent for perspective
  if (toggle.isFeatureEnabled('useOldNamespaceFormatPersp')) {
    if (key.startsWith(initEvent.perspective)) {
      u.initializePerspectiveNamespace(obj, io);
    }
  }

  // OLD
  // Initialize namespace if init event is sent for bot
  if (toggle.isFeatureEnabled('useOldNamespaceFormatImc')) {
    if (key.startsWith(initEvent.bot)) {
      u.initializeBotNamespace(obj, io);
    }
  }

  // OLD
  let emitPersp = toggle.isFeatureEnabled('useOldNamespaceFormatPersp')
                  && (eventType === 'subject' || eventType === 'sample');

  let emitImc = toggle.isFeatureEnabled('useOldNamespaceFormatImc')
                && (eventType === 'bot' || eventType === 'room');

  if (emitPersp || emitImc) {
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
        if (u.shouldIEmitThisObj(n, obj, pubOpts)) {
          u.doEmit(namespace, key, obj);
        }
      }
    });
  }
};
