/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/kafkaTracking.js
 */
'use strict'; // eslint-disable-line strict
const expect = require('chai').expect;
const redis = require('redis');
const Promise = require('bluebird');
const jwt = require('jsonwebtoken');
const nock = require('nock');
const sioClient = require('socket.io-client');
const subscriberInit = require('../src/subscriberInit');
const pss = require('../src/util/pubSubStats');
const conf = require('../conf/config');
const utils = require('../src/util/emitUtils');
const testUtil = require('./util/testUtil');
const tracker = require('../src/util/kafkaTracking');
const sinon = require('sinon');
const { start, stop } = require('../src/start');
const logger = require('@salesforce/refocus-logging-client');

describe('test/kafkaTracking.js >', () => {
  before(() => {
    testUtil.toggleOverride('enableSubscribeStats', true);
    testUtil.toggleOverride('enableEmitStats', true);
    testUtil.toggleOverride('enableClientStats', true);
    testUtil.toggleOverride('enableConnectionStats', true);
    testUtil.toggleOverride('useNewNamespaceFormat', true);
    testUtil.toggleOverride('enableKafkaPubSubAggregation', true);

  });

  after(() => {
    testUtil.toggleOverride('enableSubscribeStats', false);
    testUtil.toggleOverride('enableEmitStats', false);
    testUtil.toggleOverride('enableClientStats', false);
    testUtil.toggleOverride('enableConnectionStats', false);
    testUtil.toggleOverride('useNewNamespaceFormat', false);
    testUtil.toggleOverride('enableKafkaPubSubAggregation', false);
  });

  it('trackEmit', () => {
    it('Happy path', () => {
      const loggerSpy = sinon.spy(logger, 'track');
      const updatedAt = new Date().toISOString();
      tracker.trackEmit('foo', updatedAt, 5);
      const args = loggerSpy.getCall(0).args;
      expect(args[0].emittedAt).to.be.an('number');
      expect(args[0].type).to.equal('emitted');
      expect(args[0].numClientsEmittedTo).to.equal(5);
      expect(args[1]).to.equal('info');
      expect(args[2]).to.equal('pub-sub-aggregation');
      expect(args[3].sampleName).to.equal('foo');
      expect(args[3].updatedAt).to.equal(updatedAt);
      loggerSpy.restore();
    });

    it('Invalid args', () => {
      const loggerSpy = sinon.spy(logger, 'track');
      const errorSpy = sinon.spy(logger, 'error');
      const updatedAt = undefined;
      tracker.trackEmit('foo', updatedAt, 0);
      expect(loggerSpy.notCalled).to.be.true;
      expect(errorSpy.called).to.be.true;
      loggerSpy.restore();
      errorSpy.restore();
    });
  });

  it('trackClient', () => {
    it('Happy path', () => {
      const loggerSpy = sinon.spy(logger, 'track');
      const updatedAt = new Date().toISOString();
      tracker.trackClient('foo', updatedAt, Date.now());
      const args = loggerSpy.getCall(0).args;
      expect(args[0].timeReceived).to.be.an('number');
      expect(args[0].type).to.equal('acknowledged');
      expect(args[1]).to.equal('info');
      expect(args[2]).to.equal('pub-sub-aggregation');
      expect(args[3].sampleName).to.equal('foo');
      expect(args[3].updatedAt).to.equal(updatedAt);
      loggerSpy.restore();
    });

    it('Invalid args', () => {
      const loggerSpy = sinon.spy(logger, 'track');
      const errorSpy = sinon.spy(logger, 'error');
      const updatedAt = undefined;
      tracker.trackClient('foo', updatedAt, Date.now());
      expect(loggerSpy.notCalled).to.be.true;
      expect(errorSpy.called).to.be.true;
      loggerSpy.restore();
      errorSpy.restore();
    });
  });

  it('parseDate', () => {
    const date = Date.now();
    const date2 = new Date(date * 1000).toISOString();
    const res1 = tracker.parseDate(date);
    const res2 = tracker.parseDate(date2);
    expect(res1).to.equal(res2);
  });

  describe('end-to-end >', () => {
    let pubClient;
    let sockets = [];
    let token;
    const redisUrl = process.env.REDIS_URL || '//127.0.0.1:6379';
    const timestamp = Date.now();
    const receivedTime = Date.now();

    before(() => {
      conf.pubSubPerspectives = [redisUrl];
      conf.pubSubStatsLoggingInterval = 500;
      conf.secret = 'abcdefghijkl';
      conf.apiUrl = 'https://www.example.com';
      conf.apiToken = 'https://www.example.com';
      conf.authTimeout = 100;
      conf.port = 3000;
      conf.dyno = 'd1';
      pubClient = redis.createClient(redisUrl);
      start();
    });

    before(() => {
      const jwtClaim = {
        tokenname: 'token1',
        username: 'user1',
        timestamp,
      };
      token = jwt.sign(jwtClaim, conf.secret);

      nock(conf.apiUrl)
      .persist()
      .get('/v1/users/user1/tokens/token1')
      .matchHeader('Authorization', token)
      .reply(200);

      const options = {
        query: {
          id: utils.getPerspectiveNamespaceString({ rootSubject: 'root' }),
        },
        transports: ['websocket'],
      };

      for (let i = 0; i < 3; i++) {
        sockets.push(
          sioClient(`http://localhost:3000/perspectives`, options)
          .on('connect', function () {
            this.emit('auth', token);
          })
          .on('refocus.internal.realtime.sample.update', (data, cb) => cb && cb(receivedTime))
          .on('refocus.internal.realtime.sample.add', (data, cb) => cb && cb(receivedTime))
          .on('refocus.internal.realtime.sample.delete', (data, cb) => cb && cb(receivedTime))
        );
      }

      return Promise.all(sockets.map((socket) =>
        new Promise((resolve) => socket.once('authenticated', resolve))
      ));
    });

    after(() => {
      pubClient.quit();
      sockets.forEach((socket) => socket.close());
      stop();
    });

    it('end-to-end', () => {
      const updatedAt = new Date().toISOString();
      const upd = {
        'refocus.internal.realtime.sample.update': {
          name: 'testSample',
          absolutePath: 'root',
          status: 'OK',
          updatedAt,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }
      const add = {
        'refocus.internal.realtime.sample.add': {
          name: 'testSample',
          absolutePath: 'root',
          status: 'OK',
          updatedAt,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }
      const del = {
        'refocus.internal.realtime.sample.delete': {
          name: 'testSample',
          absolutePath: 'root',
          status: 'OK',
          updatedAt,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }

      const trackEmitSpy = sinon.spy(tracker, 'trackEmit');
      const trackClientSpy = sinon.spy(tracker, 'trackClient');
      const loggerSpy = sinon.spy(logger, 'track');

      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(del));

      // Add a small delay for the publish and subscribe to be completed
      return Promise.delay(100)
      .then(() => {
        expect(trackEmitSpy.callCount).to.equal(7);
        expect(trackClientSpy.callCount).to.equal(21);
        expect(loggerSpy.callCount).to.equal(28);
        expect(trackClientSpy.alwaysCalledWithExactly('testSample',
          updatedAt, receivedTime)).to.be.true;
      });
    });
  });
});
