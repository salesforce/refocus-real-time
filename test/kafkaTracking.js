/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/pubSubStats.js
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

describe('test/kafkaTracking.js >', () => {
  before(() => {
    testUtil.toggleOverride('enableSubscribeStats', true);
    testUtil.toggleOverride('enableEmitStats', true);
    testUtil.toggleOverride('enableClientStats', true);
    testUtil.toggleOverride('enableConnectionStats', true);
    testUtil.toggleOverride('useNewNamespaceFormat', true);
  });

  after(() => {
    testUtil.toggleOverride('enableSubscribeStats', false);
    testUtil.toggleOverride('enableEmitStats', false);
    testUtil.toggleOverride('enableClientStats', false);
    testUtil.toggleOverride('enableConnectionStats', false);
    testUtil.toggleOverride('useNewNamespaceFormat', false);
  });

  describe('end-to-end >', () => {
    let pubClient;
    let sockets = [];
    let token;
    const redisUrl = process.env.REDIS_URL || '//127.0.0.1:6379';
    const timestamp = Date.now();

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
          .on('refocus.internal.realtime.sample.update', (data, cb) => cb && cb(Date.now()))
          .on('refocus.internal.realtime.sample.add', (data, cb) => cb && cb(Date.now()))
          .on('refocus.internal.realtime.sample.delete', (data, cb) => cb && cb(Date.now()))
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

      const trackSubscriberSpy = sinon.spy(tracker, 'trackSubscribe');

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
        expect(trackSubscriberSpy.alwaysCalledWithExactly('testSample', updatedAt)).to.be.true;
        expect(trackSubscriberSpy.callCount).to.equal(7);
      });
    });
  });
});
