/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * tests/realtime/socketIOEmitter.js
 */
'use strict'; // eslint-disable-line strict
const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.should();
const jwt = require('jsonwebtoken');
const Promise = require('bluebird');
const conf = require('../conf/config');
const socketInit = require('../src/socketInit');
const u = require('./emitUtil');
const utils = require('../util/emitUtils');

describe('tests/realtime/socketIOEmitter.js >', () => {
  let token;
  const sampleUpdate = 'refocus.internal.realtime.sample.update';
  const subjectUpdate = 'refocus.internal.realtime.subject.update';
  const roomUpdate = 'refocus.internal.realtime.room.settingsChanged';
  const botActionUpdate = 'refocus.internal.realtime.bot.action.update';
  const botDataUpdate = 'refocus.internal.realtime.bot.data.update';
  const botEventUpdate = 'refocus.internal.realtime.bot.event.update';

  before(() => {
    conf.secret = 'abcdefghijkl';
    const jwtClaim = {
      tokenname: 'token1',
      username: 'user1',
      timestamp: Date.now(),
    };

    token = jwt.sign(jwtClaim, conf.secret);
  });

  describe('filtering >', () => {
    const botFilters = {
      bot1: {
        name: 'bot1',
        id: 1,
      },
      bot2: {
        name: 'bot2',
        id: 2,
      },
      bot3: {
        name: 'bot3',
        id: 3,
      },
    };

    const roomFilters = {
      room1: {
        name: 'room1',
        id: 1,
      },
      room2: {
        name: 'room2',
        id: 2,
      },
      room3: {
        name: 'room3',
        id: 3,
      },
    };

    const clientFilters = {

      // root subject
      noFilters: u.buildFilters({}),
      'root.sub1': u.buildFilters({
        rootSubject: 'root.sub1',
      }),
      'root.sub2': u.buildFilters({
        rootSubject: 'root.sub2',
      }),
      'root.sub2.sub4': u.buildFilters({
        rootSubject: 'root.sub2.sub4',
      }),

      // status filter
      ok: u.buildFilters({
        statusFilterInclude: ['Ok'],
      }),
      '!ok': u.buildFilters({
        statusFilterExclude: ['Ok'],
      }),
      'info || warning || critical': u.buildFilters({
        statusFilterInclude: ['Info', 'Warning', 'Critical'],
      }),
      '!(ok || timeout || invalid)': u.buildFilters({
        statusFilterExclude: ['Ok', 'Timeout', 'Invalid'],
      }),

      // sub/asp - one filter
      stag1: u.buildFilters({
        subjectTagInclude: ['stag1'],
      }),
      '!(stag1 || stag2)': u.buildFilters({
        subjectTagExclude: ['stag1', 'stag2'],
      }),
      'atag1 || atag2': u.buildFilters({
        aspectTagInclude: ['atag1', 'atag2'],
      }),
      '!atag1': u.buildFilters({
        aspectTagExclude: ['atag1'],
      }),
      'asp1 || asp2': u.buildFilters({
        aspectNameInclude: ['asp1', 'asp2'],
      }),
      '!(asp1 || asp2)': u.buildFilters({
        aspectNameExclude: ['asp1', 'asp2'],
      }),

      // sub/asp - two filters
      'stag1 && (atag1 || atag2)': u.buildFilters({
        subjectTagInclude: ['stag1'],
        aspectTagInclude: ['atag1', 'atag2'],
      }),
      'atag1 && !(asp1 || asp2)': u.buildFilters({
        aspectTagInclude: ['atag1'],
        aspectNameExclude: ['asp1', 'asp2'],
      }),
      '!(stag1 || stag2) && !(atag1 || atag2)': u.buildFilters({
        subjectTagExclude: ['stag1', 'stag2'],
        aspectTagExclude: ['atag1', 'atag2'],
      }),

      // sub/asp - three filters
      'stag1 && (atag1 || atag2) && asp1': u.buildFilters({
        subjectTagInclude: ['stag1'],
        aspectTagInclude: ['atag1', 'atag2'],
        aspectNameInclude: ['asp1'],
      }),
      'stag1 && atag1 && !asp1': u.buildFilters({
        subjectTagInclude: ['stag1'],
        aspectTagInclude: ['atag1'],
        aspectNameExclude: ['asp1'],
      }),
      '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)': u.buildFilters({
        subjectTagExclude: ['stag1', 'stag2'],
        aspectTagExclude: ['atag1', 'atag2'],
        aspectNameInclude: ['asp1', 'asp2'],
      }),
      '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)': u.buildFilters({
        subjectTagExclude: ['stag1', 'stag2'],
        aspectTagExclude: ['atag1'],
        aspectNameExclude: ['asp1', 'asp2'],
      }),

      // all filters
      'root.sub1: atag1 - info || warning || critical': u.buildFilters({
        rootSubject: 'root.sub1',
        statusFilterInclude: ['Info', 'Warning', 'Critical'],
        aspectTagInclude: ['atag1'],
      }),
      'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)': u.buildFilters({
        rootSubject: 'root.sub2',
        statusFilterExclude: ['Ok', 'Info'],
        subjectTagExclude: ['stag1'],
        aspectTagInclude: ['atag1', 'atag2'],
      }),
      'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok': u.buildFilters({
        rootSubject: 'root.sub2.sub4',
        statusFilterInclude: ['Ok'],
        subjectTagInclude: ['stag1'],
        aspectTagInclude: ['atag1', 'atag2'],
        aspectNameExclude: ['asp1', 'asp2'],
      }),
    };

    const _ = false;
    const X = true;

    describe('old format', () => {
      let sioServer;
      const boundFuncs = {};

      before(() => {
        sioServer = require('socket.io')(3000);
        socketInit(sioServer);
        Object.values(clientFilters).forEach((p) =>
          utils.initializePerspectiveNamespace(p, sioServer)
        );

        return u.connectClientsOldFormat(sioServer, clientFilters, token)
        .then((oldClients) => {
          boundFuncs.testSampleUpdate = u.bindEmitAndExpect(
            sioServer, oldClients, sampleUpdate
          );
          boundFuncs.testSubjectUpdate = u.bindEmitAndExpect(
            sioServer, oldClients, subjectUpdate
          );
        });
      });

      after((done) => {
        sioServer.close(done);
      });

      runFilterTests(boundFuncs);
    });

    function runFilterTests(boundFuncs) {
      let testSampleUpdate;
      let testSubjectUpdate;
      before(() => {
        testSampleUpdate = boundFuncs.testSampleUpdate;
        testSubjectUpdate = boundFuncs.testSubjectUpdate;
      });

      describe('subjectUpdate', () => {
        describe('absolutePath', () => {
          it('root:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub5:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('notRoot:', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [_, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('tags', () => {
          it('root.sub0: [stag1]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0: [stag2]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0: [stag0]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('absPath + tags', () => {
          it('root.sub1: [stag1]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1: [stag2]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2: [stag1]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2: [stag2]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4: [stag1]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [X, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4: [stag2]', function () {
            return testSubjectUpdate({
              eventBody: u.textToSubject(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });
      });

      describe('sampleUpdate', () => {
        describe('no filter fields', () => {
          it('root.sub0|asp0 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('absolutePath', () => {
          it('root.sub1|asp0 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp0 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('status', () => {
          it('root.sub0|asp0 - Critical', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0 - Timeout', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('sub tags', () => {
          it('root.sub0|asp0: [stag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0: [stag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0: [stag1, stag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('asp tags', () => {
          it('root.sub0|asp0: [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0: [atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0: [atag1, atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('asp name', () => {
          it('root.sub0|asp1 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2 - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [X, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('sub/asp - two filter fields', () => {
          it('root.sub0|asp0: [stag1] [atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ]
            });
          });

          it('root.sub0|asp1: [stag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2: [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('sub/asp - three filter fields', () => {
          it('root.sit|asp1: [stag1] [atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp1: [stag2] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2: [stag1] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2: [stag2] [atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('all filter fields', () => {
          it('root.sub1|asp1: [stag1] [atag1] - Critical', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag1] [atag1] - Info', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag1] [atag1] - Info', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag1] [atag2] - Info', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag1] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag2] [atag1] - Warning', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [atag1] - Warning', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [X, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [X, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag2] [atag1] - Warning', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [X, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [X, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag1] [atag1] - Warning', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [X, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag2] - Warning', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag2] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [X, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [X, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] [atag2] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [X, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] [atag1] - Info', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [_, 'ok'],
                [X, '!ok'],
                [X, 'info || warning || critical'],
                [X, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [X, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [X, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [X, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [X, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag2] [atag1] - Ok', function () {
            return testSampleUpdate({
              eventBody: u.textToSample(this.test.title),
              clientExpectations: [
                [X, 'noFilters'],
                [_, 'root.sub1'],
                [X, 'root.sub2'],
                [X, 'root.sub2.sub4'],
                [X, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [X, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [X, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [X, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });
      });
    }
  });
});

