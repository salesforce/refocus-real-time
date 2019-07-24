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
const stdout = require('test-console').stdout;
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
const { start, stop } = require('../src/start');
const globalKey = 'pubsubstats';

describe('test/pubSubStats.js >', () => {
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

  describe('trackSubscribe >', () => {
    describe('elapsed >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('obj has "updatedAt"', () => {
        pss.trackSubscribe('hello.world', { updatedAt: Date.now() - 1000 });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('subCount', 1);
        expect(g['hello.world'].subTime).to.be.greaterThan(100);
      });

      it('obj has "new" with "updatedAt"', () => {
        pss.trackSubscribe('hello.world', {
          new: { updatedAt: Date.now() - 1000 },
        });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('subCount', 1);
        expect(g['hello.world'].subTime).to.be.greaterThan(100);
      });

      it('obj has "new" without "updatedAt"', () => {
        pss.trackSubscribe('hello.world', {
          new: { notUpdatedAt: Date.now() - 1000 },
        });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('subCount', 1);
        expect(g['hello.world']).to.have.property('subTime', 0);
      });

      it('no updatedAt', () => {
        pss.trackSubscribe('hello.world', { hello: 'world' });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('subCount', 1);
        expect(g['hello.world']).to.have.property('subTime', 0);
      });
    });

    describe('pub/sub >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('pub and sub and multiple event types', () => {
        pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackSubscribe('hello.world', { updatedAt: Date.now() - 1 });

        const g = global[globalKey];

        expect(g).to.have.property('bye.world');
        const bye = g['bye.world'];
        expect(bye).to.have.property('subCount', 3);
        expect(bye).to.be.have.property('subTime').to.be.greaterThan(1000);

        expect(g).to.have.property('hello.world');
        const hi = g['hello.world'];
        expect(hi).to.have.property('subCount', 1);
        expect(hi).to.have.property('subTime').to.be.lessThan(100);
      });
    });
  });

  describe('trackEmit >', () => {
    describe('elapsed >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('obj has "updatedAt"', () => {
        pss.trackEmit('hello.world', { updatedAt: Date.now() - 1000 });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('emitCount', 1);
        expect(g['hello.world'].emitTime).to.be.greaterThan(100);
      });

      it('obj has "new" with "updatedAt"', () => {
        pss.trackEmit('hello.world', {
          new: { updatedAt: Date.now() - 1000 },
        });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('emitCount', 1);
        expect(g['hello.world'].emitTime).to.be.greaterThan(100);
      });

      it('obj has "new" without "updatedAt"', () => {
        pss.trackEmit('hello.world', {
          new: { notUpdatedAt: Date.now() - 1000 },
        });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('emitCount', 1);
        expect(g['hello.world']).to.have.property('emitTime', 0);
      });

      it('no updatedAt', () => {
        pss.trackEmit('hello.world', { hello: 'world' });
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('emitCount', 1);
        expect(g['hello.world']).to.have.property('emitTime', 0);
      });
    });

    describe('pub/sub >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('pub and sub and multiple event types', () => {
        pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
        pss.trackEmit('hello.world', { updatedAt: Date.now() - 1 });

        const g = global[globalKey];

        expect(g).to.have.property('bye.world');
        const bye = g['bye.world'];
        expect(bye).to.have.property('emitCount', 3);
        expect(bye).to.be.have.property('emitTime').to.be.greaterThan(1000);

        expect(g).to.have.property('hello.world');
        const hi = g['hello.world'];
        expect(hi).to.have.property('emitCount', 1);
        expect(hi).to.have.property('emitTime').to.be.lessThan(100);
      });
    });
  });

  describe('trackClient >', () => {
    describe('elapsed >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('obj has "updatedAt"', () => {
        pss.trackClient('hello.world', { updatedAt: Date.now() - 1000 }, Date.now());
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('clientCount', 1);
        expect(g['hello.world'].clientTime).to.be.greaterThan(100);
      });

      it('obj has "new" with "updatedAt"', () => {
        pss.trackClient('hello.world', {
          new: { updatedAt: Date.now() - 1000 },
        }, Date.now());
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('clientCount', 1);
        expect(g['hello.world'].clientTime).to.be.greaterThan(100);
      });

      it('obj has "new" without "updatedAt"', () => {
        pss.trackClient('hello.world', {
          new: { notUpdatedAt: Date.now() - 1000 },
        }, Date.now());
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('clientCount', 1);
        expect(g['hello.world']).to.have.property('clientTime', 0);
      });

      it('no updatedAt', () => {
        pss.trackClient('hello.world', { hello: 'world' }, Date.now());
        const g = global[globalKey];
        expect(g).to.have.property('hello.world');
        expect(g['hello.world']).to.have.property('clientCount', 1);
        expect(g['hello.world']).to.have.property('clientTime', 0);
      });
    });

    describe('pub/sub >', () => {
      beforeEach(() => (delete global[globalKey]));
      afterEach(() => (delete global[globalKey]));

      it('pub and sub and multiple event types', () => {
        pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
        pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
        pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
        pss.trackClient('hello.world', { updatedAt: Date.now() - 1 }, Date.now());

        const g = global[globalKey];

        expect(g).to.have.property('bye.world');
        const bye = g['bye.world'];
        expect(bye).to.have.property('clientCount', 3);
        expect(bye).to.be.have.property('clientTime').to.be.greaterThan(1000);

        expect(g).to.have.property('hello.world');
        const hi = g['hello.world'];
        expect(hi).to.have.property('clientCount', 1);
        expect(hi).to.have.property('clientTime').to.be.lessThan(100);
      });
    });
  });

  describe('log >', () => {
    let inspect;

    beforeEach(() => {
      inspect = stdout.inspect();
      delete global[globalKey];
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('hello.world', { updatedAt: Date.now() - 1 });
      pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackEmit('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackEmit('hello.world', { updatedAt: Date.now() - 1 });
      pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
      pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
      pss.trackClient('bye.world', { updatedAt: Date.now() - 1000 }, Date.now());
      pss.trackClient('hello.world', { updatedAt: Date.now() - 1 }, Date.now());
      pss.log('MyProcessName');
    });

    afterEach(() => {
      delete global[globalKey];
      inspect.restore();
    });

    it('subscribe', () => {
      const re1 = /info: activity=pubsub key=bye.world process=MyProcessName subCount=3 subTime=\d+ emitCount=3 emitTime=\d+ clientCount=3 clientTime=\d+ \n/; // jscs:ignore maximumLineLength
      const re2 = /info: activity=pubsub key=hello.world process=MyProcessName subCount=1 subTime=\d+ emitCount=1 emitTime=\d+ clientCount=1 clientTime=\d+ \n/; // jscs:ignore maximumLineLength
      expect(inspect.output).to.be.an('Array');
      expect(inspect.output).to.have.lengthOf(2);
      expect(inspect.output[0]).to.match(re1);
      expect(inspect.output[1]).to.match(re2);
    });
  });

  describe('end-to-end >', () => {
    let pubClient;
    let sockets = [];
    let token;
    let inspect;
    const redisUrl = process.env.REDIS_URL || '//127.0.0.1:6379';
    const timestamp = Date.now();

    before(() => {
      inspect = stdout.inspect();
      delete global[globalKey];
      conf.pubSubPerspectives = [redisUrl];
      conf.pubSubStatsLoggingInterval = 100;
      conf.secret = 'abcdefghijkl';
      conf.apiUrl = 'https://www.example.com';
      conf.apiToken = 'https://www.example.com';
      conf.authTimeout = 100;
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
      delete global[globalKey];
      inspect.restore();
      pubClient.quit();
      sockets.forEach((socket) => socket.close());
      stop();
    });

    const connRe = /info: activity=pubsub key=connections process=0 connectCount=3 connectedSockets=3 \n/;
    const updRe = /info: activity=pubsub key=refocus.internal.realtime.sample.update process=0 subCount=4 subTime=\d+ emitCount=4 emitTime=\d+ clientCount=12 clientTime=\d+ \n/;
    const addRe = /info: activity=pubsub key=refocus.internal.realtime.sample.add process=0 subCount=2 subTime=\d+ emitCount=2 emitTime=\d+ clientCount=6 clientTime=\d+ \n/;
    const delRe = /info: activity=pubsub key=refocus.internal.realtime.sample.delete process=0 subCount=1 subTime=\d+ emitCount=1 emitTime=\d+ clientCount=3 clientTime=\d+ \n/;

    it('end-to-end', () => {
      const upd = {
        'refocus.internal.realtime.sample.update': {
          absolutePath: 'root',
          status: 'OK',
          updatedAt: Date.now() - 1000,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }
      const add = {
        'refocus.internal.realtime.sample.add': {
          absolutePath: 'root',
          status: 'OK',
          updatedAt: Date.now() - 1000,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }
      const del = {
        'refocus.internal.realtime.sample.delete': {
          absolutePath: 'root',
          status: 'OK',
          updatedAt: Date.now() - 1000,
          aspect: { name: 'asp1' },
          subject: { tags: [] },
        },
      }

      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(del));

      return Promise.delay(conf.pubSubStatsLoggingInterval)
      .then(() => {
        expect(inspect.output).to.be.an('Array');
        expect(inspect.output).to.have.lengthOf(4);
        expect(inspect.output[0]).to.match(connRe);
        expect(inspect.output[1]).to.match(updRe);
        expect(inspect.output[2]).to.match(addRe);
        expect(inspect.output[3]).to.match(delRe);
      });
    });
  });
});
