const debug = require('debug')('refocus-real-time:emitter');
const toggle = require('feature-toggles');
const u = require('../util/emitUtils');
const eventTypeIndex = 3;
const initEvent = {
  bot: 'refocus.internal.realtime.bot.namespace.initialize',
  perspective: 'refocus.internal.realtime.perspective.namespace.initialize',
};

module.exports = (io, key, obj, pubOpts) => {
  // newObjectAsString contains { key: {new: obj }}
  const newObjectAsString = u.getNewObjAsString(key, obj);

  // NEW
  if (toggle.isFeatureEnabled('useNewNamespaceFormat')) {
    const eventType = key.split('.')[eventTypeIndex];
    if (eventType === 'subject' || eventType === 'sample') {
      const perspectives = Array.from(u.connectedRooms['/perspectives']).filter((roomName) =>
        u.shouldIEmitThisObj(roomName, obj)
      );
      u.emitToClients(io, '/perspectives', perspectives, key, newObjectAsString);
    } else if (eventType === 'bot') {
      const rooms = [obj.roomId];
      const bots = [obj.botId];
      u.emitToClients(io, '/rooms', rooms , key, newObjectAsString);
      u.emitToClients(io, '/bots', bots  , key, newObjectAsString);
    } else if (eventType === 'room') {
      const rooms = [obj.id];
      const bots = obj.type && obj.type.bots && obj.type.bots.map(bot => bot.id);
      u.emitToClients(io, '/rooms', rooms, key, newObjectAsString);
      u.emitToClients(io, '/bots', bots , key, newObjectAsString);
    }
  }

  // OLD
  if (toggle.isFeatureEnabled('useOldNamespaceFormat')) {
    // Initialize namespace if init event is sent for perspective or bot
    if (key.startsWith(initEvent.perspective)) {
      u.initializePerspectiveNamespace(obj, io);
    } else if (key.startsWith(initEvent.bot)) {
      u.initializeBotNamespace(obj, io);
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
        if (u.shouldIEmitThisObj(n, obj, pubOpts)) {
          namespace.emit(key, newObjectAsString);
        }
      }
    });
  }
};
