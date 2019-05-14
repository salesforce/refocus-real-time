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
const filters = [
  'aspectFilter',
  'subjectTagFilter',
  'aspectTagFilter',
  'statusFilter',
];
const botAbsolutePath = '/Bots';

/**
 * A function to see if an object is a subject object or not. It returns true
 * if an object passed has 'parentAbsolutePath' as one of its property.
 * @param  {Object}  obj - An object instance
 * @returns {Boolean} - returns true if the object has the property
 * "parentAbsolutePath"
 */
function isThisSubject(obj) {
  return obj.hasOwnProperty('parentAbsolutePath');
}

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
  if (isThisSubject(obj)) return applyFilter(subjectTagFilter, obj.tags);

  // Otherwise it's a sample, so apply all the filters and return the result.
  return applyFilter(aspectFilter, obj.aspect.name) &&
    applyFilter(subjectTagFilter, obj.subject.tags) &&
    applyFilter(aspectTagFilter, obj.aspect.tags) &&
    applyFilter(statusFilter, obj.status);
} // perspectiveEmit

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

  if (absPathNsp === botAbsolutePath) {
    return botEmit(nspComponents, obj, pubOpts);
  }

  return false;
}

/**
 * When passed a perspective object, it returns a namespace string based on the
 * fields set in the prespective object. A namespace string is of the format
 * subjectAbsolutePath&aspectFilterType=aspectNames&
 * subjectTagFilterType=subjectTags&aspectTagFilterType=aspectTags&
 * statusFilterType=statusFilter.
 * NOTE: It looks like socketIO is not able to send data over namespace
 * containing ',' and a combination of '&|' characters.
 * @param  {Instance} inst - Perspective object
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

/**
 * Initializes a socketIO namespace based on the perspective object.
 * @param {Instance} inst - The perspective instance.
 * @param {Socket.io} io - The socketio's server side object
 * @returns {Set} - The socketio server side object with the namespaces
 * initialized
 */
function initializePerspectiveNamespace(inst, io) {
  const nspString = getPerspectiveNamespaceString(inst);
  io.of(nspString);
  return io;
}

/**
 * Initializes a socketIO namespace based on the bot object.
 * @param {Instance} inst - The perspective instance.
 * @param {Socket.io} io - The socketio's server side object
 * @returns {Set} - The socketio server side object with the namespaces
 * initialized
 */
function initializeBotNamespace(inst, io) {
  const nspString = getBotsNamespaceString(inst);
  io.of(nspString);
  return io;
}

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
  applyFilter, // for testing only
  getBotsNamespaceString,
  getNewObjAsString,
  getPerspectiveNamespaceString,
  initializeBotNamespace,
  initializePerspectiveNamespace,
  shouldIEmitThisObj,
  parseObject,
}; // exports
