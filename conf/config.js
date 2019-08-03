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
  port: pe.PORT || (isProd ? 443 : 3000),
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

/*
 * Env var REDIS_PUBSUB_BOTS currently only supports a single Redis url.
 * TODO: update to do same as for perspectives to support multiple redis
 *       instances.
 */
config.pubSubBots = (config.pubSubBots && pe[config.pubSubBots]) ?
  [pe[config.pubSubBots]] : [];

/*
 * Env var REDIS_PUBSUB_PERSPECTIVES should have a comma-separated list of
 * env var names where each one references the connection url of a Redis
 * instance. Ignore if an entry in the comma-separated list has no
 * corresponding env var, otherwise populate with array of Redis connection
 * urls.
 */
config.pubSubPerspectives = config.pubSubPerspectives
  .split(',')
  .map((r) => r.trim())
  .filter((r) => pe[r])
  .map((r) => pe[r]);

const toggles = {
  // use old socket.io namespace format
  useOldNamespaceFormatPersp: environmentVariableTrue(pe, 'USE_OLD_NAMESPACE_FORMAT_PERSPECTIVES'),

  // use old socket.io namespace format for IMC
  useOldNamespaceFormatImc: environmentVariableTrue(pe, 'USE_OLD_NAMESPACE_FORMAT_IMC'),

  // use new socket.io namespace/room format
  useNewNamespaceFormat: environmentVariableTrue(pe, 'USE_NEW_NAMESPACE_FORMAT'),

  // use new socket.io namespace/room format for IMC
  useNewNamespaceFormatImc: environmentVariableTrue(pe, 'USE_NEW_NAMESPACE_FORMAT_IMC'),

  // log subscribe stats
  enableSubscribeStats: envVarIncludes(pe, 'ENABLE_STATS', 'subscribe'),

  // log emit stats
  enableEmitStats: envVarIncludes(pe, 'ENABLE_STATS', 'emit'),

  // log client stats
  enableClientStats: envVarIncludes(pe, 'ENABLE_STATS', 'client'),

  // log connection stats
  enableConnectionStats: envVarIncludes(pe, 'ENABLE_STATS', 'connection'),

  activityLoggingRoom: envVarIncludes(pe, 'ACTIVITY_LOGGING', 'room'),
  activityLoggingUser: envVarIncludes(pe, 'ACTIVITY_LOGGING', 'user'),
}; // toggles

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

/**
 * Return boolean true if the named environment variable contains a comma-
 * delimited list of strings and one of those strings matches the test string
 * (case-insensitive). If the env var === '*' then returns true for any test
 * string.
 *
 * @param {Object} env - The node process environment. (Passing it into
 *  this function instead of just getting a reference to it *inside* this
 *  function makes the function easier to test.)
 * @param {String} envVarName - The name of the environment var.
 * @param {String} str - The test string.
 * @returns {Boolean} true if the named environment variable is boolean true or
 *  case-insensitive string 'true'.
 */
function envVarIncludes(env, envVarName, str) {
  const val = env[envVarName];

  /* str length < 1? False! */
  if (str.length < 1) return false;

  /* Not defined or null? False! */
  if (typeof val === 'undefined' || !val) return false;

  /* Wildcard "all"? True! */
  if (val.toString() === '*') return true;

  /* Array includes str? (Strip any leading/trailing spaces first. */
  const arr = val.toString().toLowerCase().split(',').map((i) => i.trim());
  return arr.includes(str.toLowerCase());
} // envVarIncludes
