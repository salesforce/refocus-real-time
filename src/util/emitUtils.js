/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * util/emitUtils.js
 *
 * Emit utils.
 */
const debug = require('debug')('refocus-real-time:emitter');
const winston = require('winston');
const toggle = require('feature-toggles');
const jwt = require('jsonwebtoken');
const Promise = require('bluebird');
const conf = require('../../conf/config');
const jwtVerifyAsync = Promise.promisify(jwt.verify);
const request = require('superagent');
const pubSubStats = require('./pubSubStats');
const logger = new (winston.Logger)({
  transports: [new (winston.transports.Console)()],
});

const filters = [
  'aspectFilter',
  'subjectTagFilter',
  'aspectTagFilter',
  'statusFilter',
];
const botAbsolutePath = '/Bots';

const ObjectType = {
  Aspect: 'Aspect',
  Sample: 'Sample',
  Subject: 'Subject',
};

/**
 * A function to see if an object is a subject/aspect/sample. It returns
 * "Subject" if an object passed has 'parentAbsolutePath' as one of its
 * properties, "Aspect" if has "timeout" attribute, otherwise assumes it is
 * Sample.
 *
 * @param  {Object}  obj - An object instance
 * @returns {String} - returns the object type
 */
function whatAmI(obj) {
  if (obj.hasOwnProperty('parentAbsolutePath')) return ObjectType.Subject;
  if (obj.hasOwnProperty('timeout')) return ObjectType.Aspect;
  return ObjectType.Sample;
} // whatAmI

/**
 * Returns true if at least one element of the array is present in the set.
 *
 * @param  {Set}  filterValueSet - A set of strings contaning filter values
 * @param  {Array}  objValueArr - A any array of strings contaning obj values
 * @returns {Boolean} - returns true if any of the elements of the obj value
 *  array is found in the filter value set
 */
function isPresent(filterValueSet, objValueArr) {
  for (let i = 0; i < objValueArr.length; i++) {
    if (filterValueSet.has(objValueArr[i])) {
      return true;
    }
  }

  return false;
}

/**
 * The filterString is used to extract the filterType and filter values and the
 * object is compared against the extracted filter to check if the field of the
 * object matches the filter criteria.
 *
 * @param  {String} filterString - String of the form filterType=values.
 * @param  {String|Array} objValues - The values of the object to be matched
 *  against filter criteria (empty array if none)
 * @returns {Boolean} - true if the object matches the filter criteria
 */
function applyFilter(filterString, objValues = []) {
  // Short-circuit return true if there is no filterString
  if (!filterString) return true;

  /*
   * The filter string is a name-value pair of the form `filterType=values`.
   * For example, aspect filterString `INCLUDE=Temperature,Humidity` has
   * filterType `INCLUDE` and aspect values `Temperature` and `Humidity`.
   * The "value" part of the name-value pair will be empty if the filter is not
   * set in the perspective.
   */
  const nvp = filterString.split('=');

  /*
   * Short-circuit return true if the filterString is not a name-value pair
   * with an "=" separator.
   */
  if (nvp.length < 2) return true;

  // Get filter type (INCLUDE/EXCLUDE). Short-circuit return true if invalid.
  const filterType = nvp[0];
  if (!['INCLUDE', 'EXCLUDE'].includes(filterType)) return true;

  const filterValueSet = new Set(nvp[1].split(';'));
  const objValuesArr = Array.isArray(objValues) ? objValues : [objValues];
  const valueIsPresent = isPresent(filterValueSet, objValuesArr);

  if (filterType === 'INCLUDE') return valueIsPresent;
  return !valueIsPresent; // otherwise it's an EXCLUDE filter
} // applyFilter

/**
 * Returns true if this object should be emitted as a real-time event to a
 * namespace (representing a perspective) given the various filters passed in
 * here as nspComponents.
 *
 * @param  {String} nspComponents - array of namespace strings for filtering
 * @param  {Object} obj - Object that is to be emitted to the client
 * @returns {Boolean} - true if this obj is to be emitted based on the filters
 *  represented by the nspComponents
 */
function perspectiveEmit(nspComponents, obj) {
  /*
   * Note: I perf tested these individual assignments from the nspComponents
   * array vs. using destructuring assignment, and individual assigments was
   * 10x faster.
   */
  const aspectFilter = nspComponents[1];
  const subjectTagFilter = nspComponents[2];
  const aspectTagFilter = nspComponents[3];
  const statusFilter = nspComponents[4];

  /*
   * When none of the filters are set, the nspComponent just has the
   * subjectAbsolutePath in it, so we do not have to check for the filter
   * conditions and we can just return true.
   */
  if (nspComponents.length < 2) return true;

  /*
   * If the obj is a subject, just apply the subjectTagFilter and return the
   * result.
   */
  const objectType = whatAmI(obj);
  if (objectType === ObjectType.Subject) {
    return applyFilter(subjectTagFilter, obj.tags);
  }

  /*
   * If the obj is an aspect, apply the aspect name filter and aspect tag
   * filter and return the result.
   */
  if (objectType === ObjectType.Aspect) {
    return applyFilter(aspectFilter, obj.aspect.name) &&
      applyFilter(aspectTagFilter, obj.tags);
  }

  /*
   * Otherwise we assume it is a sample.
   */
  return applyFilter(aspectFilter, obj.aspect.name) &&
    applyFilter(subjectTagFilter, obj.subject.tags) &&
    applyFilter(aspectTagFilter, obj.aspect.tags) &&
    applyFilter(statusFilter, obj.status);
} // perspectiveEmit

// OLD - remove along with namespace toggles
/**
 * Returns true if this object should be emitted as a real-time event to a
 * namespace (representing a room) given the various filters passed in here
 * as nspComponents.
 *
 * @param {String} nspComponents - array of namespace strings for filtering
 * @param {Object} obj - Object that is to be emitted to the client
 * @param {Object} pubOpts - Options for client and channel to publish with.
 * @returns {Boolean} - true if this obj is to be emitted based on the filters
 *  represented by the nspComponents
 */
function botEmit(nspComponents, obj, pubOpts) {
  if (!pubOpts) return false;
  const objFilter = nspComponents[pubOpts.filterIndex];
  return applyFilter(objFilter, obj[pubOpts.filterField]);
} // botEmit

/**
 * Splits up the nspString into its components and decides if it is a bot or a
 * perspective that needs to be emitted.
 *
 * @param {String} nspString - A namespace string, that identifies a
 *  socketio namespace
 * @param {Object} obj - Object that is to be emitted to the client
 * @param {Object} pubOpts - Options for client and channel to publish with.
 * @returns {Boolean} - true if this obj is to be emitted over this namespace
 *  identified by this namespace string.
 */
function shouldIEmitThisObj(nspString, obj, pubOpts) {
  // Extract all the components which make up a namespace.
  const nspComponents = nspString.split('&');
  const absPathNsp = nspComponents[0];
  const absolutePathObj = '/' + obj.absolutePath;

  /*
   * Note: we are using `str1.indexOf(str2) === 0` here instead of the more
   * intuitve `str1.startsWith(str2)` because performance tested better.
   */
  if (absolutePathObj.indexOf(absPathNsp) === 0) {
    return perspectiveEmit(nspComponents, obj);
  }

  // OLD - remove along with namespace toggles
  if (absPathNsp === botAbsolutePath) {
    return botEmit(nspComponents, obj, pubOpts);
  }

  return false;
}

// OLD - remove along with namespace toggles
/**
 * When passed a perspective object, it returns a namespace string based on the
 * fields set in the prespective object. A namespace string is of the format
 * subjectAbsolutePath&aspectFilterType=aspectNames&
 * subjectTagFilterType=subjectTags&aspectTagFilterType=aspectTags&
 * statusFilterType=statusFilter.
 * NOTE: It looks like socketIO is not able to send data over namespace
 * containing ',' and a combination of '&|' characters.
 * @param  {Object} inst - Perspective object
 * @returns {String} - namespace string.
 */
function getPerspectiveNamespaceString(inst) {
  let namespace = '/';
  if (inst.rootSubject) {
    namespace += inst.rootSubject;
  }

  for (let i = 0; i < filters.length; i++) {
    if (inst[filters[i]] && inst[filters[i]].length) {
      namespace += '&' + inst[filters[i] + 'Type'] + '=' +
        inst[filters[i]].join(';');
    } else {
      namespace += '&' + inst[filters[i] + 'Type'];
    }
  }

  return namespace;
}

// OLD - remove along with namespace toggles
/**
 * When passed a room object, it returns a namespace string based on the
 * fields set in the room object.
 * @param  {Instance} inst - Room object
 * @returns {String} - namespace string.
 */
function getBotsNamespaceString(inst) {
  let namespace = botAbsolutePath;
  if (inst) {
    namespace += '&' + inst.name;
  }

  return namespace;
}

// OLD - remove along with namespace toggles
/**
 * Initializes a socketIO namespace based on the perspective object.
 * @param {Object} inst - The perspective instance.
 * @param {Socket.io} io - The socketio's server side object
 */
function initializePerspectiveNamespace(inst, io) {
  const nspString = getPerspectiveNamespaceString(inst);
  io.of(nspString).on('connect', (socket) =>
    Promise.join(
      validateIp(socket),
      validateTokenOldFormat(socket),
    )
    .then(() => {
      pubSubStats.trackConnect();
      socket.on('disconnect', () => {
        pubSubStats.trackDisconnect();
      });
    })
    .catch((err) => {
      pubSubStats.trackAuthError();
      socket.emit('auth error', err.message);
      socket.disconnect();
    })
  );
}

// OLD - remove along with namespace toggles
/**
 * Makes an api call to get all existing perspectives, and initializes
 * namespaces based on the response.
 * @param {Socket.io} io - The socketio's server side object
 */
function initializePerspectiveNamespacesFromApi(io) {
  return req
  .get(`${conf.apiUrl}/v1/perspectives`)
  .set('Authorization', conf.apiToken)
  .then((perspectives) =>
    perspectives.body.forEach((p) =>
      initializePerspectiveNamespace(p, io)
    )
  );
}

// OLD - remove along with namespace toggles
/**
 * Makes an api call to get all existing Imc rooms, and initializes
 * namespaces based on the response.
 * @param {Socket.io} io - The socketio's server side object
 */
function initializeBotNamespacesFromApi(io) {
  return req
  .get(`${conf.apiUrl}/v1/rooms?active=true`)
  .set('Authorization', conf.apiToken)
  .then((rooms) =>
    rooms.body.forEach((r) =>
      initializeBotNamespace(r, io)
    )
  );
}

// OLD - remove along with namespace toggles
/**
 * Initializes a socketIO namespace based on the bot object.
 * @param {Object} inst - The perspective instance.
 * @param {Socket.io} io - The socketio's server side object
 */
function initializeBotNamespace(inst, io) {
  const nspString = getBotsNamespaceString(inst);
  io.of(nspString).on('connect', (socket) =>
    Promise.join(
      validateIp(socket),
      validateTokenOldFormat(socket),
    )
    .then(() => {
      pubSubStats.trackConnect();
      socket.on('disconnect', () => {
        pubSubStats.trackDisconnect();
      });
    })
    .catch((err) => {
      pubSubStats.trackAuthError();
      socket.emit('auth error', err.message);
      socket.disconnect();
    })
  );
}

// NEW
/**
 * Initialize a socketIO namespace with a connect event that validates the
 * connection and assigns to the appropriate room.
 * @param {String} namespace - The namespace to initialize
 * @param {Socket.io} io - The socketio's server side object
 */
function initializeNamespace(namespace, io) {
  connectedRooms[namespace] = new Set();
  io.of(namespace).on('connect', (socket) =>
    Promise.join(
      validateIp(socket),
      validateTokenNewFormat(socket),
    )
    .then((responses) => {
      const user = responses[1].body.name;
      const ipAddress = responses[0];
      logger.info(`activity=connect user=${user} ipAddress=${ipAddress} ` +
        `room=${socket.handshake.query.id}`);
      addToRoom(socket);
      trackConnectedRooms(socket, user, ipAddress);
      socket.emit('authenticated');
    })
    .catch((err) => {
      pubSubStats.trackAuthError();
      logger.error('auth error', err.message);
      socket.emit('auth error', err.message);
      socket.disconnect();
    })
  );
}

// NEW
/**
 * Add the socket to the appropriate room.
 * @param {Socket} socket - The socket connection
 */
function addToRoom(socket) {
  const roomName = socket.handshake.query.id;
  socket.join(roomName);
}

// NEW
/**
 * Keep track of which rooms are active for the namespace
 * @param {Socket} socket - The socket connection
 */
const connectedRooms = {};
function trackConnectedRooms(socket, user, ipAddress) {
  pubSubStats.trackConnect();
  const nsp = socket.nsp;
  const roomName = socket.handshake.query.id;
  connectedRooms[nsp.name].add(roomName);

  socket.on('disconnect', () => {
    logger.info(`activity=disconnect user=${user} ipAddress=${ipAddress} ` +
      `room=${socket.handshake.query.id} nsp=${nsp.name}`);
    pubSubStats.trackDisconnect();
    const allSockets = Object.values(nsp.connected);
    const roomIsActive = allSockets.some((socket) =>
      Object.keys(socket.rooms).includes(roomName)
    );

    if (!roomIsActive) {
      connectedRooms[nsp.name].delete(roomName);
    }
  });
}

// OLD
function validateTokenOldFormat(socket) {
  const token = socket.handshake.query && socket.handshake.query.t;
  if (!token) {
    return Promise.reject(new Error('Access denied: no token provided'));
  }

  return jwtVerifyAsync(socket.handshake.query.t, conf.secret)
}

// NEW
function validateTokenNewFormat(socket) {
  return new Promise((resolve) => socket.once('auth', resolve))
  .then((token) => Promise.join(
    token,
    jwtVerifyAsync(token, conf.secret),
  ))
  .then(([token, { username, tokenname }]) => {
    const path = (username === tokenname) ? `v1/users/${username}`
                                          : `v1/users/${username}/tokens/${tokenname}`;
    return request.get(`${conf.apiUrl}/${path}`)
                  .set('Authorization', token);
  })
  .timeout(conf.authTimeout);
}

/**
 * Verify that the socket is connecting from a whitelisted IP address.
 *
 * @param {Socket} socket - the socket connection
 * @returns {Promise} resolves to the ip address if valid
 * @throws {Error} if the ip address is not whitelisted or can not be identified
 */
function validateIp(socket) {
  if (conf.ipWhitelistService) {
    const ipAddress = getIpAddressFromSocket(socket);
    if (!ipAddress) {
      throw new Error('could not identify ip address');
    }

    return request.get(`${conf.ipWhitelistService}/${conf.ipWhitelistPath}/${ipAddress}`)
    .then((res) => {
      if (!res.body.allow) {
        throw new Error('Access denied: ip not allowed', ipAddress);
      }

      return ipAddress;
    });
  }
}

/**
 * Determines the ip address origin of the socket connection based on either
 * the socket handshake's "x-forwarded-for" header or the socket handshake's
 * address, and returns the ip address to the caller.
 *
 * @param {Socket} socket - the socket connection
 * @returns {*} a string representing the ip address
 */
function getIpAddressFromSocket(socket) {
  if (socket && socket.handshake) {
    // From socket handshake's "x-forwarded-for" header?
    if (socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) {
      return socket.handshake.headers['x-forwarded-for'];
    }

    // From socket handshake's address?
    if (socket.handshake.address) {
      return socket.handshake.address;
    }
  }
}; // getIpAddressFromSocket

function getNewObjAsString(key, obj) {
  const wrappedObj = {};
  if (key.endsWith('update')) {
    wrappedObj[key] = { new: obj };
  } else if (key === 'refocus.internal.realtime.sample.nochange') {
    wrappedObj[key] = {
      name: obj.name,
      updatedAt: obj.updatedAt,
      aspect: {
        name: obj.aspect.name,
        timeout: obj.aspect.timeout, // needed by lens
      },
    };
  } else {
    wrappedObj[key] = obj;
  }

  return JSON.stringify(wrappedObj);
}

// NEW
/**
 * Emit to all specified rooms.
 * @param {Socket.io} io - socket.io server
 * @param {String}  nsp - the namespace to emit to
 * @param {Array}  rooms - names of socket.io rooms to emit to
 * @param {String}  key - event type
 * @param {Object}  obj - event body
 */
function emitToClients(io, nsp, rooms, key, obj) {
  const namespace = io.of(nsp);
  if (rooms && rooms.length) {
    rooms.forEach((room) =>
      namespace.to(room)
    );
    doEmit(namespace, key, obj);
  }
}

/**
 * Emit to the provided namespace, tracking stats if enabled.
 * @param {Object}  nsp - the namespace to emit to
 * @param {String}  key - event type
 * @param {Object}  obj - event body
 */
function doEmit(nsp, key, obj) {
  const newObjectAsString = getNewObjAsString(key, obj); // { key: {new: obj }}
  pubSubStats.trackEmit(key, obj);
  if (!toggle.isFeatureEnabled('enableClientStats')) {
    nsp.emit(key, newObjectAsString);
  } else {
    Object.values(nsp.connected)
    .forEach((socket) => {
      socket.emit(key, newObjectAsString, (time) =>
        pubSubStats.trackClient(key, obj, time)
      );
    });
  }
}

/**
 * The message object received from the redis channel, contains a "new" property
 * when a database instance is updated. This function checks to see if the
 * message object contains a "new" property, if it does, it returns the new
 * object, unless the event type is subject remove. (need to send the old subject
 * so the filtering sends the remove event to the old perspectives)
 * @param {Object}  messgObj - Message object received from the redis channel.
 * @param {String}  key - event type
 * @returns {Object} - returns the parsed message object.
 */
const subjectRemove = 'refocus.internal.realtime.subject.remove';
function parseObject(messgObj, key) {
  if (key === subjectRemove && messgObj.old) {
    return messgObj.old;
  } else if (messgObj.new) {
    return messgObj.new;
  } else {
    return messgObj;
  }
}

module.exports = {
  getBotsNamespaceString,
  getPerspectiveNamespaceString,
  initializeBotNamespace,
  initializePerspectiveNamespace,
  initializePerspectiveNamespacesFromApi,
  initializeBotNamespacesFromApi,
  initializeNamespace,
  connectedRooms,
  shouldIEmitThisObj,
  emitToClients,
  doEmit,
  parseObject,
}; // exports
