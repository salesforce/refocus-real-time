/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * conf/config.js
 *
 * Configuration Settings
 */
'use strict'; // eslint-disable-line strict
const featureToggles = require('feature-toggles');
const ms = require('ms');
const pe = process.env;

const isProd = pe.NODE_ENV === 'production';
const config = {
  apiUrl: pe.REFOCUS_API_URL,
  apiToken: pe.REFOCUS_API_TOKEN,
  authTimeout: pe.TOKEN_AUTH_TIMEOUT || 5000,
  dyno: pe.DYNO || null,
  ipWhitelistService: pe.IP_WHITELIST_SERVICE || '',
  port: pe.PORT || isProd ? 443 : 3000,
  pubSubBots: pe.REDIS_PUBSUB_BOTS || '',
  pubSubPerspectives: pe.REDIS_PUBSUB_PERSPECTIVES || '',
  pubSubStatsLoggingInterval: ms(pe.PUB_SUB_STATS_LOGGING_INTERVAL || '1m'),
  secret: pe.SECRET,
  webConcurrency: pe.WEB_CONCURRENCY || 1,
  isProd,
  perspectiveChannel: 'focus',
  botChannel: 'imc',
  ipWhitelistPath: 'v1/verify',
};

config.pubSubBots = config.pubSubBots && pe[config.pubSubBots] && [pe[config.pubSubBots]] || [];
config.pubSubPerspectives =
  config.pubSubPerspectives
  .split(',')
  .map((r) => r.trim())
  .filter((r) => pe[r])
  .map((r) => pe[r]);

const toggles = {
  // use old socket.io namespace format
  useOldNamespaceFormat: environmentVariableTrue(pe, 'USE_OLD_NAMESPACE_FORMAT'),

  // use new socket.io namespace/room format
  useNewNamespaceFormat: environmentVariableTrue(pe, 'USE_NEW_NAMESPACE_FORMAT'),

  // use new socket.io namespace/room format
  enablePubSubStatsLogs: environmentVariableTrue(pe, 'ENABLE_PUBSUB_STATS_LOGS'),
}; // shortTermToggles

featureToggles.load(toggles);

module.exports = config;

/**
 * Return boolean true if the named environment variable is boolean true or
 * case-insensitive string 'true'.
 *
 * @param {Object} processEnv - The node process environment. (Passing it into
 *  this function instead of just getting a reference to it *inside* this
 *  function makes the function easier to test.)
 * @param {String} environmentVariableName - The name of the environment var.
 * @returns {Boolean} true if the named environment variable is boolean true or
 *  case-insensitive string 'true'.
 */
function environmentVariableTrue(processEnv, environmentVariableName) {
  const x = processEnv[environmentVariableName];
  return typeof x !== 'undefined' && x !== null &&
    x.toString().toLowerCase() === 'true';
} // environmentVariableTrue
