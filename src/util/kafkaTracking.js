/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * /kafkaTracking.js
 */
const logger = require('@salesforce/refocus-logging-client');
const featureToggles = require('feature-toggles');

const { pubSubAggregationTopic } = require('../../conf/config');

const MESSAGE_TYPES = {
  EMITTED: 'emitted',
  ACKNOWLEDGED: 'acknowledged'
};

const parseDate = (date) => typeof date === 'number' ?
  new Date(date * 1000).toISOString() : date;

const trackEmit = (sampleName, updatedAt, numClientsEmittedTo) => {
  if (featureToggles.isFeatureEnabled('enableKafkaPubSubAggregation')) {
    if (typeof sampleName !== 'string' || !(typeof updatedAt === 'string' ||
      typeof updatedAt === 'number') || typeof numClientsEmittedTo !== 'number') {
        logger.error(`Received invalid args in trackEmit: ${sampleName} ${updatedAt} ${numClientsEmittedTo}`);
        return;
    }

    updatedAt = parseDate(updatedAt);
    logger.track({
      type: MESSAGE_TYPES.EMITTED,
      emittedAt: Date.now(),
      numClientsEmittedTo
    },
    'info', pubSubAggregationTopic, {
      sampleName,
      updatedAt,
    });
  }
}

const trackClient = (sampleName, updatedAt, timeReceived) => {
  if (featureToggles.isFeatureEnabled('enableKafkaPubSubAggregation')) {
    if (typeof sampleName !== 'string' || !(typeof updatedAt === 'string' ||
      typeof updatedAt === 'number') || typeof timeReceived !== 'number') {
        logger.error(`Received invalid args in trackClient: ${sampleName} ${updatedAt} ${timeReceived}`);
        return;
    }

    updatedAt = parseDate(updatedAt);
    logger.track({
      type: MESSAGE_TYPES.ACKNOWLEDGED,
      timeReceived
    },
    'info', pubSubAggregationTopic, {
      sampleName,
      updatedAt,
    });
  }
    
}

module.exports = {
  trackEmit,
  trackClient,
  parseDate, // exported for testing
};
