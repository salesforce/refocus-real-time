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

const AGGR_TOPIC = 'pubSub-aggregation';

const MESSAGE_TYPES = {
  SUBSCRIBE_TIME: 'publishTime',
  EMITTED_TO_AND_TIME: 'emittedToAndTime'
};

const trackSubscribe = (sampleName, updatedAt) => {
  if (typeof sampleName !== 'string' || !(typeof updatedAt === 'string' ||
    typeof updatedAt === 'number')) {
      logger.error('Received invalid args:', sampleName, updatedAt);
      return;
  }

  updatedAt = typeof updatedAt === 'number' ?
    new Date(updatedAt * 1000).toISOString() : updatedAt;

  logger.track({
    type: MESSAGE_TYPES.SUBSCRIBE_TIME,
    subscribedAt: Date.now(),
  },
  'info', AGGR_TOPIC, {
    sampleName,
    updatedAt,
  });
}

const trackEmit = (sampleName, updatedAt, numClientsEmittedTo) => {
  if (typeof sampleName !== 'string' || !(typeof updatedAt === 'string' ||
    typeof updatedAt === 'number') || typeof numClientsEmittedTo !== 'number') {
      logger.error('Received invalid args:', sampleName, updatedAt);
      return;
  }

  updatedAt = typeof updatedAt === 'number' ?
    new Date(updatedAt * 1000).toISOString() : updatedAt;

  logger.track({
    type: MESSAGE_TYPES.EMITTED_TO_AND_TIME,
    emittedAt: Date.now(),
    numClientsEmittedTo
  },
  'info', AGGR_TOPIC, {
    sampleName,
    updatedAt,
  });
}

const trackClient = (sampleName, updatedAt, timeReceived) => {
  if (typeof sampleName !== 'string' || !(typeof updatedAt === 'string' ||
    typeof updatedAt === 'number') || typeof numClientsEmittedTo !== 'number') {
      logger.error('Received invalid args:', sampleName, updatedAt);
      return;
  }

  updatedAt = typeof updatedAt === 'number' ?
    new Date(updatedAt * 1000).toISOString() : updatedAt;

  logger.track({
    type: MESSAGE_TYPES.EMITTED_TO_AND_TIME,
    emittedAt: Date.now(),
    numClientsEmittedTo
  },
  'info', AGGR_TOPIC, {
    sampleName,
    updatedAt,
  });
}

module.exports = {
  trackSubscribe,
  trackEmit,
  AGGR_TOPIC,
  MESSAGE_TYPES,
};
