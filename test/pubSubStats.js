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
const subscriberInit = require('../src/subscriberInit');
const pss = require('../util/pubSubStats');
const conf = require('../conf/config');
const testUtil = require('./util/testUtil');
const globalKey = 'pubsubstats';

describe('test/pubSubStats.js >', () => {
  describe('track >', () => {
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

  describe('log >', () => {
    let inspect;

    beforeEach(() => {
      inspect = stdout.inspect();
      delete global[globalKey];
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('bye.world', { updatedAt: Date.now() - 1000 });
      pss.trackSubscribe('hello.world', { updatedAt: Date.now() - 1 });
      pss.log('MyProcessName');
    });

    afterEach(() => {
      delete global[globalKey];
      inspect.restore();
    });

    it('ok', () => {
      const re1 = /info: activity=pubsub key=bye.world process=MyProcessName subCount=3 subTime=\d+ \n/; // jscs:ignore maximumLineLength
      const re2 = /info: activity=pubsub key=hello.world process=MyProcessName subCount=1 subTime=\d+ \n/; // jscs:ignore maximumLineLength
      expect(inspect.output).to.be.an('Array');
      expect(inspect.output).to.have.lengthOf(2);
      expect(inspect.output[0]).to.match(re1);
      expect(inspect.output[1]).to.match(re2);
    });
  });

  describe('end-to-end >', () => {
    let io;
    let pubClient;
    let inspect;
    const redisUrl = process.env.REDIS_URL || '//127.0.0.1:6379';
    const processName = 'p1';

    before(() => {
      inspect = stdout.inspect();
      delete global[globalKey];
      conf.pubSubPerspectives = [redisUrl];
      conf.pubSubStatsLoggingInterval = 50;
      testUtil.toggleOverride('enablePubSubStatsLogs', true);

      pubClient = redis.createClient(redisUrl);
      io = require('socket.io')(conf.port);
      subscriberInit.init(io, processName);
    });

    after((done) => {
      testUtil.toggleOverride('enablePubSubStatsLogs', false);
      delete global[globalKey];
      inspect.restore();
      pubClient.quit();
      subscriberInit.cleanup();
      io.close(done);
    });

    const updRe = /info: activity=pubsub key=sample.update process=p1 subCount=4 subTime=\d+ \n/;
    const addRe = /info: activity=pubsub key=sample.add process=p1 subCount=2 subTime=\d+ \n/;
    const delRe = /info: activity=pubsub key=sample.delete process=p1 subCount=1 subTime=\d+ \n/;

    it('end-to-end', function () {
      this.timeout(6000);
      const upd = {
        'sample.update': { updatedAt: Date.now() - 1000 },
      }
      const add = {
        'sample.add': { updatedAt: Date.now() - 1000 },
      }
      const del = {
        'sample.delete': { updatedAt: Date.now() - 1000 },
      }

      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(upd));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(add));
      pubClient.publish(conf.perspectiveChannel, JSON.stringify(del));

      return Promise.delay(5000)
             .then(() => {
               expect(inspect.output).to.be.an('Array');
               expect(inspect.output).to.have.lengthOf(3);
               expect(inspect.output[0]).to.match(updRe);
               expect(inspect.output[1]).to.match(addRe);
               expect(inspect.output[2]).to.match(delRe);
             });
    });
  });
});
