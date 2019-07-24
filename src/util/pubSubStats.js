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
const winston = require('winston');
const logger = new (winston.Logger)({
  transports: [new (winston.transports.Console)()],
});
const globalKey = 'pubsubstats';

/**
 * Used by subscribers to track the pubsub stats by event type
 * and process. These stats are stored and updated in memory in a global
 * variable by each subscriber (i.e. every node process running on each web dyno).
 *
 * @param {String} evt - the real-time event type
 * @param {Object} obj - the event payload
 */
function trackSubscribe(evt, obj) {
  const now = Date.now();

  // Validate args
  if (!evt || typeof evt !== 'string' || evt.length === 0) {
    console.error('pubSubStats.track error: evt must be non-empty string');
    return;
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    console.error('pubSubStats.track error: obj must be a non-array object');
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
    elapsed = now - new Date(obj.updatedAt);
  } else if (obj.hasOwnProperty('new') && obj.new.hasOwnProperty('updatedAt')) {
    updatedAtFromObj = obj.new.updatedAt;
    nameFromObj = obj.new.name;
    elapsed = now - new Date(obj.new.updatedAt);
  } else {
    console.error('Missing updatedAt: ' + JSON.stringify(obj));
  }

  if (elapsed > 2000) {
    debug(`/realtime/pubSubStats.js|track|src=sub|evt=${evt}|` +
      `now=${now}|name=${nameFromObj}|updatedAt=${updatedAtFromObj}|` +
      `updatedAtAsDate=${new Date(updatedAtFromObj)}|elapsed=${elapsed}|`);
  }

  // Initialize the global variable if necessary
  if (!global.hasOwnProperty(globalKey)) {
    global[globalKey] = {};
  }

  /*
   * Initialize a new attribute in the global variable for this event type, if
   * necessary.
   */
  if (!global[globalKey].hasOwnProperty(evt)) {
    global[globalKey][evt] = {
      subCount: 0,
      subTime: 0,
    };
  }

  // Increment the count and elapsed time for this event.
  global[globalKey][evt].subCount++;
  global[globalKey][evt].subTime += elapsed;
} // trackSubscribe

/**
 * Writes out the pub-sub statistics for each event type and reset the global
 * pubSubStatsAggregator.
 *
 * @param {String} processName - the process name, e.g. web.1:3, worker.2, ...
 */
function log(processName) {
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
    subCount: eventStats[evt].subCount,
    subTime: eventStats[evt].subTime
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
};
