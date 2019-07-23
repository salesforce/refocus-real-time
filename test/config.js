/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/config.js
 *
 * NOTE: Run with NODE_DEBUG=redis to see all the redis debug :)
 */
'use strict'; // eslint-disable-line strict
const expect = require('chai').expect;
const uncache = require('./uncache');

describe('config >', () => {
  after(() => uncache('../conf/config'));

  describe('pubSubPerspectives >', () => {
    describe('No REDIS_PUBSUB_PERSPECTIVES >', () => {
      beforeEach(() => uncache('../conf/config'));

      afterEach(() => {
        delete process.env.REDIS_PUBSUB_PERSPECTIVES;
      });

      it('not defined', () => {
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql([]);
      });

      it('empty string', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = '';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql([]);
      });
    });

    describe('One REDIS_PUBSUB_PERSPECTIVES >', () => {
      beforeEach(() => uncache('../conf/config'));
      afterEach(() => {
        delete process.env.REDIS_PUBSUB_PERSPECTIVES;
        delete process.env.SOMETHING;
      });

      it('missing corresponding env var', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = 'SOMETHING';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql([]);
      });

      it('has corresponding env var', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = 'SOMETHING';
        process.env.SOMETHING = 'abcdefg';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql(['abcdefg']);
      });
    });

    describe('Multiple REDIS_PUBSUB_PERSPECTIVES >', () => {
      beforeEach(() => uncache('../conf/config'));

      afterEach(() => {
        delete process.env.REDIS_PUBSUB_PERSPECTIVES;
        delete process.env.SOMETHING;
        delete process.env.THING2;
      });

      it('all missing corresponding env var', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = 'SOMETHING, THING2';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql([]);
      });

      it('one missing corresponding env var', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = 'SOMETHING, THING2';
        process.env.SOMETHING = 'abcdefg';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives).to.deep.eql(['abcdefg']);
      });

      it('all have corresponding env var', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = 'SOMETHING, THING2';
        process.env.SOMETHING = 'abcdefg';
        process.env.THING2 = 'hijklmnop';
        const config = require('../conf/config');
        expect(config.pubSubPerspectives)
          .to.deep.eql(['abcdefg', 'hijklmnop']);
      });
    });
  });

  describe('pubSubBots >', () => {
    describe('No REDIS_PUBSUB_BOTS >', () => {
      beforeEach(() => uncache('../conf/config'));

      afterEach(() => {
        delete process.env.REDIS_PUBSUB_PERSPECTIVES;
      });

      it('not defined', () => {
        const config = require('../conf/config');
        expect(config.pubSubBots).to.deep.eql([]);
      });

      it('empty string', () => {
        process.env.REDIS_PUBSUB_PERSPECTIVES = '';
        const config = require('../conf/config');
        expect(config.pubSubBots).to.deep.eql([]);
      });
    });

    describe('Has REDIS_PUBSUB_BOTS >', () => {
      beforeEach(() => uncache('../conf/config'));
      afterEach(() => {
        delete process.env.REDIS_PUBSUB_BOTS;
        delete process.env.SOMETHING;
      });

      it('missing corresponding env var', () => {
        process.env.REDIS_PUBSUB_BOTS = 'SOMETHING';
        const config = require('../conf/config');
        expect(config.pubSubBots).to.deep.eql([]);
      });

      it('has corresponding env var', () => {
        process.env.REDIS_PUBSUB_BOTS = 'SOMETHING';
        process.env.SOMETHING = 'abcdefg';
        const config = require('../conf/config');
        expect(config.pubSubBots).to.deep.eql(['abcdefg']);
      });

      it('no support for multiple redis instances at this time', () => {
        process.env.REDIS_PUBSUB_BOTS = 'SOMETHING, THING2';
        process.env.SOMETHING = 'abcdefg';
        process.env.THING2 = 'hijklmnop';
        const config = require('../conf/config');
        expect(config.pubSubBots).to.deep.eql([]);
      });
    });
  });
});
