/**
 * In the case of multiple instances connected to the same socket.io room
 * (ie. multiple instances of the same bot) this function will set the namespace
 *  to only emit data to one.
 * @param {Socket.io} io - socket.io server
 * @param {Socket.io} namespace - object representing namespace
 * @param {String} namespaceId - name of namespace
 * @param {String} room - id of room within namespace
 */
function setNamespaceToEmitToSingleInstance(io, namespace, namespaceId, room) {
  const connectionsToRoom = io.nsps[namespaceId].adapter.rooms[room];
  const connectionToEmitTo = connectionsToRoom && connectionsToRoom.sockets ?
    Object.keys(connectionsToRoom.sockets)[0] : null;
  if (connectionToEmitTo) namespace.to(connectionToEmitTo);
}

module.exports =  {
  setNamespaceToEmitToSingleInstance
};