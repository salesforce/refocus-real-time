/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

const KafkaProducer = require('no-kafka');
const config = require('./kafkaLoggingConfig').getConfig();
const featureToggles = require('feature-toggles');

let producer;
const initKafkaLoggingProducer = () => {
  if (featureToggles.isFeatureEnabled('kafkaLogging')) {
    producer = new KafkaProducer.Producer({
      connectionString: config.connectionString,
      ssl: {
        cert: config.sslCert,
        key: config.sslKey,
      },
    });
    return producer.init().catch((err) => {
      throw new Error(`Failed to initialized Kafka producer for logging, error: ${err}`);
    });
  }

  return Promise.resolve();
};

const logFunc = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  trace: console.log,
  debug: console.log,
};

const writeLog = (value, key = 'info', topic = config.topic, callback = console.log) => {
  const messageValue = {
    sendTimeStamp: new Date(),
    value,
  };
  const logMessage = {
    topic,
    partition: 0,
    message: {
      key,
      value: JSON.stringify(messageValue),
    },
  };
  let promise;
  if (featureToggles.isFeatureEnabled('kafkaLogging')) {
    promise = producer.send(logMessage).catch(err => {
      callback(`Sending the log message to Kafka cluster failed, retrying, error: ${err}`);
      producer.send(logMessage); // retry again if failed
    });
  }

  if (featureToggles.isFeatureEnabled('localLogging')) {
    callback('Local logging is turned on');
    logFunc[logMessage.message.key](logMessage.message.value);
  }

  return promise ? promise : Promise.resolve();
};

module.exports = {
  initKafkaLoggingProducer,
  writeLog,
  error: (value) => writeLog(value, 'error'),
  warn: (value) => writeLog(value, 'warn'),
  info: (value) => writeLog(value, 'info'),
  debug: (value) => writeLog(value, 'debug'),
  verbose: (value) => writeLog(value, 'verbose'),
  silly: (value) => writeLog(value, 'silly'),
};
