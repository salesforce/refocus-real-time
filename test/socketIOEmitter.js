/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/socketIOEmitter.js
 */
'use strict'; // eslint-disable-line strict
const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.should();
const jwt = require('jsonwebtoken');
const Promise = require('bluebird');
const nock = require('nock');
const conf = require('../conf/config');
const connectUtil = require('./util/connectUtil');
const emitUtil = require('./util/emitUtil');
const testUtil = require('./util/testUtil');
const utils = require('../util/emitUtils');

describe('test/socketIOEmitter.js >', () => {
  let token;

  before(() => {
    conf.secret = 'abcdefghijkl';
    conf.apiUrl = 'https://www.example.com';

    const jwtClaim = {
      tokenname: 'token1',
      username: 'user1',
      timestamp: Date.now(),
    };
    token = jwt.sign(jwtClaim, conf.secret);

    nock(conf.apiUrl)
    .persist()
    .get('/v1/users/user1/tokens/token1')
    .matchHeader('Authorization', token)
    .reply(200);

    nock(conf.apiUrl)
    .persist()
    .get('/v1/users/user1/tokens/token1')
    .reply(401);

    nock(conf.apiUrl)
    .persist()
    .get((path) => path.startsWith('/v1/users/'))
    .reply(404);
  });

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
    noFilters: connectUtil.buildFilters({}),
    'root.sub1': connectUtil.buildFilters({
      rootSubject: 'root.sub1',
    }),
    'root.sub2': connectUtil.buildFilters({
      rootSubject: 'root.sub2',
    }),
    'root.sub2.sub4': connectUtil.buildFilters({
      rootSubject: 'root.sub2.sub4',
    }),

    // status filter
    ok: connectUtil.buildFilters({
      statusFilterInclude: ['Ok'],
    }),
    '!ok': connectUtil.buildFilters({
      statusFilterExclude: ['Ok'],
    }),
    'info || warning || critical': connectUtil.buildFilters({
      statusFilterInclude: ['Info', 'Warning', 'Critical'],
    }),
    '!(ok || timeout || invalid)': connectUtil.buildFilters({
      statusFilterExclude: ['Ok', 'Timeout', 'Invalid'],
    }),

    // sub/asp - one filter
    stag1: connectUtil.buildFilters({
      subjectTagInclude: ['stag1'],
    }),
    '!(stag1 || stag2)': connectUtil.buildFilters({
      subjectTagExclude: ['stag1', 'stag2'],
    }),
    'atag1 || atag2': connectUtil.buildFilters({
      aspectTagInclude: ['atag1', 'atag2'],
    }),
    '!atag1': connectUtil.buildFilters({
      aspectTagExclude: ['atag1'],
    }),
    'asp1 || asp2': connectUtil.buildFilters({
      aspectNameInclude: ['asp1', 'asp2'],
    }),
    '!(asp1 || asp2)': connectUtil.buildFilters({
      aspectNameExclude: ['asp1', 'asp2'],
    }),

    // sub/asp - two filters
    'stag1 && (atag1 || atag2)': connectUtil.buildFilters({
      subjectTagInclude: ['stag1'],
      aspectTagInclude: ['atag1', 'atag2'],
    }),
    'atag1 && !(asp1 || asp2)': connectUtil.buildFilters({
      aspectTagInclude: ['atag1'],
      aspectNameExclude: ['asp1', 'asp2'],
    }),
    '!(stag1 || stag2) && !(atag1 || atag2)': connectUtil.buildFilters({
      subjectTagExclude: ['stag1', 'stag2'],
      aspectTagExclude: ['atag1', 'atag2'],
    }),

    // sub/asp - three filters
    'stag1 && (atag1 || atag2) && asp1': connectUtil.buildFilters({
      subjectTagInclude: ['stag1'],
      aspectTagInclude: ['atag1', 'atag2'],
      aspectNameInclude: ['asp1'],
    }),
    'stag1 && atag1 && !asp1': connectUtil.buildFilters({
      subjectTagInclude: ['stag1'],
      aspectTagInclude: ['atag1'],
      aspectNameExclude: ['asp1'],
    }),
    '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)': connectUtil.buildFilters({
      subjectTagExclude: ['stag1', 'stag2'],
      aspectTagExclude: ['atag1', 'atag2'],
      aspectNameInclude: ['asp1', 'asp2'],
    }),
    '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)': connectUtil.buildFilters({
      subjectTagExclude: ['stag1', 'stag2'],
      aspectTagExclude: ['atag1'],
      aspectNameExclude: ['asp1', 'asp2'],
    }),

    // all filters
    'root.sub1: atag1 - info || warning || critical': connectUtil.buildFilters({
      rootSubject: 'root.sub1',
      statusFilterInclude: ['Info', 'Warning', 'Critical'],
      aspectTagInclude: ['atag1'],
    }),
    'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)': connectUtil.buildFilters({
      rootSubject: 'root.sub2',
      statusFilterExclude: ['Ok', 'Info'],
      subjectTagExclude: ['stag1'],
      aspectTagInclude: ['atag1', 'atag2'],
    }),
    'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok': connectUtil.buildFilters({
      rootSubject: 'root.sub2.sub4',
      statusFilterInclude: ['Ok'],
      subjectTagInclude: ['stag1'],
      aspectTagInclude: ['atag1', 'atag2'],
      aspectNameExclude: ['asp1', 'asp2'],
    }),
  };

  describe('filtering >', () => {
    describe('old format', () => {
      let sioServer;
      let connectedClients;

      before(() => {
        testUtil.toggleOverride('useOldNamespaceFormat', true);
        testUtil.toggleOverride('useNewNamespaceFormat', false);
        sioServer = require('socket.io')(3000);

        Object.values(clientFilters).forEach((p) =>
          utils.initializePerspectiveNamespace(p, sioServer)
        );
        Object.values(roomFilters).forEach((r) =>
          utils.initializeBotNamespace(r, sioServer)
        );
        Object.values(botFilters).forEach((b) =>
          utils.initializeBotNamespace(b, sioServer)
        );

        return Promise.join(
          connectUtil.connectPerspectivesOldFormat(sioServer, clientFilters, token),
          connectUtil.connectBotsOldFormat(sioServer, botFilters, token),
          connectUtil.connectRoomsOldFormat(sioServer, roomFilters, token),
        )
        .then(([perspectiveClients, botClients, roomClients]) => {
          connectedClients = { ...perspectiveClients, ...botClients, ...roomClients };
          emitUtil.setupTestFuncs({
            sioServer,
            perspectiveClients,
            botClients,
            roomClients,
            // expect all - bot/room filtering doesn't work with the old format
            expectOverrides: [true],
          });
        });
      });

      after((done) => {
        testUtil.toggleOverride('useOldNamespaceFormat', false);
        testUtil.toggleOverride('useNewNamespaceFormat', false);
        connectUtil.closeClients(connectedClients);
        sioServer.close(done);
      });

      runFilterTests();
    });

    describe('new format', () => {
      let sioServer;
      let connectedClients;

      before(() => {
        testUtil.toggleOverride('useOldNamespaceFormat', false);
        testUtil.toggleOverride('useNewNamespaceFormat', true);
        sioServer = require('socket.io')(3000);
        utils.initializeNamespace('/bots', sioServer);
        utils.initializeNamespace('/rooms', sioServer);
        utils.initializeNamespace('/perspectives', sioServer);

        return Promise.join(
          connectUtil.connectPerspectivesNewFormat(sioServer, clientFilters, token),
          connectUtil.connectBotsNewFormat(sioServer, botFilters, token),
          connectUtil.connectRoomsNewFormat(sioServer, roomFilters, token),
        )
        .then(([perspectiveClients, botClients, roomClients]) => {
          connectedClients = { ...perspectiveClients, ...botClients, ...roomClients };
          emitUtil.setupTestFuncs({
            sioServer,
            perspectiveClients,
            botClients,
            roomClients,
          });
        });
      });

      after((done) => {
        testUtil.toggleOverride('useOldNamespaceFormat', false);
        testUtil.toggleOverride('useNewNamespaceFormat', false);
        connectUtil.closeClients(connectedClients);
        sioServer.close(done);
      });

      runFilterTests();
    });

    describe('old/new format', () => {
      let sioServer;
      let connectedClients;

      before(() => {
        testUtil.toggleOverride('useOldNamespaceFormat', true);
        testUtil.toggleOverride('useNewNamespaceFormat', true);
        sioServer = require('socket.io')(3000);

        // old format
        Object.values(clientFilters).forEach((p) =>
          utils.initializePerspectiveNamespace(p, sioServer)
        );
        Object.values(roomFilters).forEach((r) =>
          utils.initializeBotNamespace(r, sioServer)
        );
        Object.values(botFilters).forEach((b) =>
          utils.initializeBotNamespace(b, sioServer)
        );

        // new format
        utils.initializeNamespace('/bots', sioServer);
        utils.initializeNamespace('/rooms', sioServer);
        utils.initializeNamespace('/perspectives', sioServer);

        return Promise.join(
          connectUtil.connectPerspectivesOldFormat(sioServer, clientFilters, token),
          connectUtil.connectPerspectivesNewFormat(sioServer, clientFilters, token),
          connectUtil.connectBotsOldFormat(sioServer, botFilters, token),
          connectUtil.connectBotsNewFormat(sioServer, botFilters, token),
          connectUtil.connectRoomsOldFormat(sioServer, roomFilters, token),
          connectUtil.connectRoomsNewFormat(sioServer, roomFilters, token),
        )
        .then(([
          oldClients, newClients, oldBotClients,
          newBotClients, oldRoomClients, newRoomClients
        ]) => {
          const perspectiveClients = connectUtil.mergeClients(oldClients, newClients);
          const botClients = connectUtil.mergeClients(oldBotClients, newBotClients);
          const roomClients = connectUtil.mergeClients(oldRoomClients, newRoomClients);
          connectedClients = { ...perspectiveClients, ...botClients, ...roomClients };
          emitUtil.setupTestFuncs({
            sioServer,
            perspectiveClients,
            botClients,
            roomClients,
            // expect all for old clients - bot/room filtering doesn't work with the old format
            expectOverrides: [true, undefined],
          });
        });
      });

      after((done) => {
        testUtil.toggleOverride('useOldNamespaceFormat', false);
        testUtil.toggleOverride('useNewNamespaceFormat', false);
        connectUtil.closeClients(connectedClients);
        sioServer.close(done);
      });

      runFilterTests();
    });

    function runFilterTests() {
      const x = true; // event expected
      const _ = false; // event not expected

      describe('imc', () => {
        describe('botAction', () => {
          it('bot2, room3', function () {
            return emitUtil.testBotActionUpdate({
              eventBody: emitUtil.textToBotAction(this.test.title),
              botExpectations: [
                [_, 'bot1'],
                [x, 'bot2'],
                [_, 'bot3'],
              ],
              roomExpectations: [
                [_, 'room1'],
                [_, 'room2'],
                [x, 'room3'],
              ],
            });
          });
        });

        describe('botData', () => {
          it('bot3, room1', function () {
            return emitUtil.testBotDataUpdate({
              eventBody: emitUtil.textToBotData(this.test.title),
              botExpectations: [
                [_, 'bot1'],
                [_, 'bot2'],
                [x, 'bot3'],
              ],
              roomExpectations: [
                [x, 'room1'],
                [_, 'room2'],
                [_, 'room3'],
              ],
            });
          });
        });

        describe('botEvent', () => {
          it('bot1, room1', function () {
            return emitUtil.testBotEventUpdate({
              eventBody: emitUtil.textToBotEvent(this.test.title),
              botExpectations: [
                [x, 'bot1'],
                [_, 'bot2'],
                [_, 'bot3'],
              ],
              roomExpectations: [
                [x, 'room1'],
                [_, 'room2'],
                [_, 'room3'],
              ],
            });
          });
        });

        describe('room', () => {
          it('room1, [bot2]', function () {
            return emitUtil.testRoomUpdate({
              eventBody: emitUtil.textToRoom(this.test.title),
              botExpectations: [
                [_, 'bot1'],
                [x, 'bot2'],
                [_, 'bot3'],
              ],
              roomExpectations: [
                [x, 'room1'],
                [_, 'room2'],
                [_, 'room3'],
              ],
            });
          });

          it('room2, [bot1, bot3]', function () {
            return emitUtil.testRoomUpdate({
              eventBody: emitUtil.textToRoom(this.test.title),
              botExpectations: [
                [x, 'bot1'],
                [_, 'bot2'],
                [x, 'bot3'],
              ],
              roomExpectations: [
                [_, 'room1'],
                [x, 'room2'],
                [_, 'room3'],
              ],
            });
          });

          it('room3, [bot1, bot2, bot3]', function () {
            return emitUtil.testRoomUpdate({
              eventBody: emitUtil.textToRoom(this.test.title),
              botExpectations: [
                [x, 'bot1'],
                [x, 'bot2'],
                [x, 'bot3'],
              ],
              roomExpectations: [
                [_, 'room1'],
                [_, 'room2'],
                [x, 'room3'],
              ],
            });
          });
        });
      });

      describe('subjectUpdate', () => {
        describe('absolutePath', () => {
          it('root:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub5:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('notRoot:', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
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
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0: [stag2]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
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
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('absPath + tags', () => {
          it('root.sub1: [stag1]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1: [stag2]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2: [stag1]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2: [stag2]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4: [stag1]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [x, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4: [stag2]', function () {
            return emitUtil.testSubjectUpdate({
              eventBody: emitUtil.textToSubject(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });
      });

      describe('sampleUpdate', () => {
        describe('no filter fields', () => {
          it('root.sub0|asp0 - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('absolutePath', () => {
          it('root.sub1|asp0 - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp0 - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0 - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('status', () => {
          it('root.sub0|asp0 - Critical', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0 - Timeout', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });
        });

        describe('sub tags', () => {
          it('root.sub0|asp0: [stag1] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp0: [atag1, atag2] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2 - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [x, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
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
          it('root.sub0|asp1: [stag1] [atag2] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub0|asp2: [stag2] [atag2] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag1] [atag1] - Info', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag1] [atag1] - Info', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [atag1] - Warning', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [x, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [x, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub1|asp1: [stag2] [atag1] - Warning', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [x, 'root.sub1'],
                [_, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [x, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2|asp1: [stag1] [atag1] - Warning', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
                [_, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [x, 'stag1 && (atag1 || atag2) && asp1'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [x, 'asp1 || asp2'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [_, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [x, 'asp1 || asp2'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [x, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] [atag2] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [_, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [_, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [x, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] [atag1] - Info', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [_, 'ok'],
                [x, '!ok'],
                [x, 'info || warning || critical'],
                [x, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [x, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2)'],
                [_, 'stag1 && (atag1 || atag2) && asp1'],
                [x, 'stag1 && atag1 && !asp1'],
                [_, '!(stag1 || stag2) && !(atag1 || atag2) && (asp1 || asp2)'],
                [_, '!(stag1 || stag2) && !atag1 && !(asp1 || asp2)'],
                [_, 'root.sub1: atag1 - info || warning || critical'],
                [_, 'root.sub2: !stag1 && (atag1 || atag2) - !(ok || info)'],
                [_, 'root.sub2.sub4: stag1 && (atag1 || atag2) && !(asp1 || asp2) - ok'],
              ],
            });
          });

          it('root.sub2.sub4|asp0: [stag1] - Ok', function () {
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [x, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [_, 'atag1 || atag2'],
                [x, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
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
            return emitUtil.testSampleUpdate({
              eventBody: emitUtil.textToSample(this.test.title),
              clientExpectations: [
                [x, 'noFilters'],
                [_, 'root.sub1'],
                [x, 'root.sub2'],
                [x, 'root.sub2.sub4'],
                [x, 'ok'],
                [_, '!ok'],
                [_, 'info || warning || critical'],
                [_, '!(ok || timeout || invalid)'],
                [_, 'stag1'],
                [_, '!(stag1 || stag2)'],
                [x, 'atag1 || atag2'],
                [_, '!atag1'],
                [_, 'asp1 || asp2'],
                [x, '!(asp1 || asp2)'],
                [_, 'stag1 && (atag1 || atag2)'],
                [x, 'atag1 && !(asp1 || asp2)'],
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

  describe('by client (new format only) >', () => {
    let sioServer;
    let clients;
    beforeEach(() => {
      testUtil.toggleOverride('useOldNamespaceFormat', false);
      testUtil.toggleOverride('useNewNamespaceFormat', true);
      sioServer = require('socket.io')(3000);
      utils.initializeNamespace('/perspectives', sioServer);
    });

    afterEach((done) => {
      testUtil.toggleOverride('useOldNamespaceFormat', false);
      testUtil.toggleOverride('useNewNamespaceFormat', false);
      clients.forEach((client) => client.close());
      sioServer.close(done);
    });

    describe('root.sub1', function () {
      const sampleName = this.title;
      let expectByClient;
      let connectClients;
      let filters;

      beforeEach(() => {
        filters = clientFilters[sampleName];
        const client1 = connectUtil.connectPerspectiveNewFormat(sioServer, filters, token, false);
        const client2 = connectUtil.connectPerspectiveNewFormat(sioServer, filters, token, false);
        const client3 = connectUtil.connectPerspectiveNewFormat(sioServer, filters, token, false);
        clients = [client1, client2, client3];

        const x = true; // event expected
        const _ = false; // event not expected
        connectClients = connectUtil.bindOpenCloseByClient(clients);
        expectByClient = emitUtil.bindEmitAndExpectByClient({
          sioServer,
          clients,
          eventExpectations: [
            [_, 'root.sub0|asp0 - Ok'],
            [x, 'root.sub1|asp0 - Ok'],
            [_, 'root.sub2|asp0 - Ok'],
            [_, 'root.sub2.sub4|asp0 - Ok'],
            [_, 'root.sub0|asp0 - Critical'],
            [_, 'root.sub0|asp0 - Timeout'],
            [_, 'root.sub0|asp0: [stag1] - Ok'],
            [_, 'root.sub0|asp0: [stag2] - Ok'],
            [_, 'root.sub0|asp0: [stag1, stag2] - Ok'],
            [_, 'root.sub0|asp0: [atag1] - Ok'],
            [_, 'root.sub0|asp0: [atag2] - Ok'],
            [_, 'root.sub0|asp0: [atag1, atag2] - Ok'],
            [_, 'root.sub0|asp1 - Ok'],
            [_, 'root.sub0|asp2 - Ok'],
            [_, 'root.sub0|asp0: [stag1] [atag2] - Ok'],
            [_, 'root.sub0|asp1: [stag2] - Ok'],
            [_, 'root.sub0|asp2: [atag1] - Ok'],
            [_, 'root.sub0|asp1: [stag1] [atag2] - Ok'],
            [_, 'root.sub0|asp1: [stag2] [atag1] - Ok'],
            [_, 'root.sub0|asp2: [stag1] [atag1] - Ok'],
            [_, 'root.sub0|asp2: [stag2] [atag2] - Ok'],
            [x, 'root.sub1|asp1: [stag1] [atag1] - Critical'],
            [x, 'root.sub1|asp1: [stag1] [atag1] - Info'],
            [_, 'root.sub2|asp1: [stag1] [atag1] - Info'],
            [x, 'root.sub1|asp1: [stag1] [atag2] - Info'],
            [x, 'root.sub1|asp1: [stag1] [atag1] - Ok'],
            [_, 'root.sub2|asp1: [stag2] [atag1] - Warning'],
            [_, 'root.sub2|asp1: [atag1] - Warning'],
            [x, 'root.sub1|asp1: [stag2] [atag1] - Warning'],
            [_, 'root.sub2|asp1: [stag1] [atag1] - Warning'],
            [_, 'root.sub2|asp1: [stag2] - Warning'],
            [_, 'root.sub2|asp1: [stag2] [atag1] - Ok'],
            [_, 'root.sub2.sub4|asp0: [stag1] [atag1] - Ok'],
            [_, 'root.sub2.sub4|asp0: [stag1] [atag2] - Ok'],
            [_, 'root.sub2.sub4|asp0: [stag1] [atag1] - Info'],
            [_, 'root.sub2.sub4|asp0: [stag1] - Ok'],
            [_, 'root.sub2.sub4|asp0: [stag2] [atag1] - Ok'],
          ],
        });
      });

      const o = true; // open socket / events received
      const x = false; // close socket
      const _ = null; // no change / events not received

      it('client events', () =>
        Promise.resolve()
        .then(() => connectClients([_, _, _]) )
        .then(() => expectByClient([_, _, _]) )

        .then(() => connectClients([o, _, _]) )
        .then(() => expectByClient([o, _, _]) )

        .then(() => connectClients([x, _, _]) )
        .then(() => expectByClient([_, _, _]) )

        .then(() => connectClients([o, _, _]) )
        .then(() => expectByClient([o, _, _]) )

        .then(() => connectClients([_, o, o]) )
        .then(() => expectByClient([o, o, o]) )

        .then(() => connectClients([x, _, _]) )
        .then(() => expectByClient([_, o, o]) )

        .then(() => connectClients([_, x, _]) )
        .then(() => expectByClient([_, _, o]) )

        .then(() => connectClients([_, _, x]) )
        .then(() => expectByClient([_, _, _]) )

        .then(() => connectClients([o, _, _]) )
        .then(() => expectByClient([o, _, _]) )

        .then(() => connectClients([x, _, _]) )
        .then(() => expectByClient([_, _, _]) )
      );

      it('make sure the filtering is only done when necessary', () => {
        const samp = 'root.sub0|asp0 - Ok';
        const nspString = utils.getPerspectiveNamespaceString(filters);
        const expectFiltered = emitUtil.bindEmitAndStubFilterCheck({
          sioServer,
          eventBody: emitUtil.textToSample(samp),
          nspString,
        });

        return Promise.resolve()
        .then(() => connectClients([_, _, _]))
        .then(() => expectFiltered(false))

        .then(() => connectClients([o, _, _]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([x, _, _]))
        .then(() => expectFiltered(false))

        .then(() => connectClients([o, _, _]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([_, o, o]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([x, _, _]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([_, x, _]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([_, _, x]))
        .then(() => expectFiltered(false))

        .then(() => connectClients([o, _, _]))
        .then(() => expectFiltered(true))

        .then(() => connectClients([x, _, _]))
        .then(() => expectFiltered(false))
      });
    });
  });
});

