/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * ./config.js
 *
 * Configuration Settings
 */
'use strict'; // eslint-disable-line strict
const pe = process.env;

const config = {
  apiUrl: pe.REFOCUS_API_URL,
  apiToken: pe.REFOCUS_API_TOKEN,
  ipWhitelistService: pe.IP_WHITELIST_SERVICE || '',
  port: pe.PORT || 3000,
  pubSubBots: pe.REDIS_PUBSUB_BOTS || '',
  pubSubPerspectives: pe.REDIS_PUBSUB_PERSPECTIVES || '',
  secret: pe.SECRET,
  perspectiveChannel: 'focus',
  botChannel: 'imc',
};

config.pubSubBots = config.pubSubBots && pe[config.pubSubBots] && [pe[config.pubSubBots]] || [];
config.pubSubPerspectives =
  config.pubSubPerspectives
  .split(',')
  .map((r) => r.trim())
  .filter((r) => pe[r])
  .map((r) => pe[r]);

module.exports = config;
