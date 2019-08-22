/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * /util/pubSubStats.js
 */
const debug = require('debug')('refocus:pubsub:elapsed');
const logger = require('@salesforce/refocus-logging-client');
const toggle = require('feature-toggles');

const globalKey = 'pubsubstats';

/**
 * Track events received on the subscriber.
 * @param {String} evt - the real-time event type
 * @param {Object} obj - the event payload
 */
function trackSubscribe(evt, obj) {
  if (toggle.isFeatureEnabled('enableSubscribeStats')) {
    const time = Date.now();
    const keys = {
      count: 'subCount',
      time: 'subTime',
    };
    track(evt, obj, time, keys);
  }
} // trackSubscribe

/**
 * Track events emitted to clients.
 * @param {String} evt - the real-time event type
 * @param {Object} obj - the event payload
 */
function trackEmit(evt, obj) {
  if (toggle.isFeatureEnabled('enableEmitStats')) {
    const time = Date.now();
    const keys = {
      count: 'emitCount',
      time: 'emitTime',
    };
    track(evt, obj, time, keys);
  }
} // trackEmit

/**
 * Track events received on the clients.
 * @param {String} evt - the real-time event type
 * @param {Object} obj - the event payload
 * @param {Number} time - response from client
 */
function trackClient(evt, obj, time) {
  if (toggle.isFeatureEnabled('enableClientStats')) {
    const keys = {
      count: 'clientCount',
      time: 'clientTime',
    };
    track(evt, obj, time, keys);
  }
} // trackClient

/**
 * Track client connect
 */
function trackConnect() {
  trackConnections('connectCount');
} // trackConnect

/**
 * Track client disconnect
 */
function trackDisconnect() {
  trackConnections('disconnectCount');
} // trackDisconnect

/**
 * Track client auth error
 */
function trackAuthError() {
  trackConnections('authErrorCount');
} // trackAuthError

/**
 * Track client connection stats
 * @param {String} count - connectCount, disconnectCount, authErrorCount
 */
function trackConnections(count) {
  if (toggle.isFeatureEnabled('enableConnectionStats')) {
    initKeys('connections', count);
    global[globalKey].connections[count]++;
  }
} // trackConnections

/**
 * Used by subscribers to track the pubsub stats by event type
 * and process. These stats are stored and updated in memory in a global
 * variable by each subscriber (i.e. every node process running on each web dyno).
 *
 * @param {String} evt - the real-time event type
 * @param {Object} obj - the event payload
 * @param {Number} time - the time the event was received
 * @param {Object} keys - the names of the time and count keys to track
 */
function track(evt, obj, time, keys) {

  // Validate args
  if (!evt || typeof evt !== 'string' || evt.length === 0) {
    logger.error('pubSubStats.track error: evt must be non-empty string');
    return;
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    logger.error('pubSubStats.track error: obj must be a non-array object');
    return;
  }

  /*
   * Calculate the elapsed time. If we can't find an "updatedAt" attribute,
   * treat the elapsed time as 0 but log the object.
   */
  let elapsed = 0;
  let updatedAtFromObj;
  let nameFromObj;
  if (obj.hasOwnProperty('updatedAt')) {
    updatedAtFromObj = obj.updatedAt;
    nameFromObj = obj.name;
    elapsed = time - new Date(obj.updatedAt);
  } else if (obj.hasOwnProperty('new') && obj.new.hasOwnProperty('updatedAt')) {
    updatedAtFromObj = obj.new.updatedAt;
    nameFromObj = obj.new.name;
    elapsed = time - new Date(obj.new.updatedAt);
  } else {
    logger.error('Missing updatedAt: ' + JSON.stringify(obj));
  }

  if (elapsed > 2000) {
    debug(`/realtime/pubSubStats.js|track|src=sub|evt=${evt}|` +
      `now=${time}|name=${nameFromObj}|updatedAt=${updatedAtFromObj}|` +
      `updatedAtAsDate=${new Date(updatedAtFromObj)}|elapsed=${elapsed}|keys=${keys}`);
  }

  initKeys(evt, keys.count);
  initKeys(evt, keys.time);

  // Increment the count and elapsed time for this event.
  global[globalKey][evt][keys.count]++;
  global[globalKey][evt][keys.time] += elapsed;
} // trackSubscribe

/**
 * Initialize the global stats object, if necessary
 *
 * @param {String} evt - the event type
 * @param {String} key - the stats key for this type
 */
function initKeys(evt, key) {
  // Initialize the global variable if necessary
  if (!global.hasOwnProperty(globalKey)) {
    global[globalKey] = {};
  }

  /*
   * Initialize a new attribute in the global variable for this event type, if
   * necessary.
   */
  if (!global[globalKey].hasOwnProperty(evt)) {
    global[globalKey][evt] = {};
  }

  // Initialize the count key for this stat type, if necessary.
  if (!global[globalKey][evt][key]) {
    global[globalKey][evt][key] = 0;
  }
}

/**
 * Writes out the pub-sub statistics for each event type and reset the global
 * pubSubStatsAggregator.
 *
 * @param {String} processName - the process name, e.g. web.1:3, worker.2, ...
 * @param {Socket.io} io - socket.io server
 */
function log(processName, io) {
  // set open connections
  if (io && toggle.isFeatureEnabled('enableConnectionStats')) {
    initKeys('connections', 'connectedSockets');
    global[globalKey].connections.connectedSockets = Object.keys(io.of('/').connected).length;
  }

  // Copy and reset the tracked stats
  const eventStats = global[globalKey];
  if (!eventStats) return;
  delete global[globalKey];

  // Log a line for each event type
  Object.keys(eventStats)
  .map((evt) => printActivityLogString({
    activity: 'pubsub',
    key: evt || 'None',
    process: processName || 'None',
    ...eventStats[evt],
  }));
} // log

/**
 * Convert activity log object to String format and print.
 *
 * @param  {Object} logObject - Log Object
 */
function printActivityLogString(logObject) {
  const logLine = Object.entries(logObject)
                  .reduce(((logStr, [key, value]) =>
                    `${logStr}${key}=${value} `
                  ), '');
  logger.info(logLine);
} // printActivityLogString

module.exports = {
  log,
  trackSubscribe,
  trackEmit,
  trackClient,
  trackConnect,
  trackDisconnect,
  trackAuthError,
};
