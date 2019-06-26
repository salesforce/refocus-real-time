/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/clientConnect.js
 */
'use strict'; // eslint-disable-line strict
const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.should();
const jwt = require('jsonwebtoken');
const sioClient = require('socket.io-client');
const nock = require('nock');
const conf = require('../conf/config');
const connectUtil = require('./util/connectUtil');
const testUtil = require('./util/testUtil');
const utils = require('../util/emitUtils');

describe('test/clientConnect.js >', () => {
  let token;
  const timestamp = Date.now();

  before(() => {
    conf.secret = 'abcdefghijkl';
    conf.apiUrl = 'https://www.example.com';
    conf.authTimeout = 100;

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

    nock(conf.apiUrl)
    .persist()
    .get('/v1/users/user1/tokens/token1')
    .reply(401);

    nock(conf.apiUrl)
    .persist()
    .get((path) => path.startsWith('/v1/users/'))
    .reply(404);
  });

  after(() => nock.cleanAll());

  const perspectiveFilters = {
    rootSubject: 'root',
  };
  const roomFilters = {
    name: 'room1',
    id: 1,
  };
  const botFilters = {
    name: 'bot1',
    id: 1,
  };

  describe('old format', () => {
    let sioServer;
    let client;

    beforeEach(() => {
      testUtil.toggleOverride('useOldNamespaceFormat', true);
      testUtil.toggleOverride('useNewNamespaceFormat', false);
      sioServer = require('socket.io')(3000);

      utils.initializePerspectiveNamespace(perspectiveFilters, sioServer);
      utils.initializeBotNamespace(roomFilters, sioServer);
      utils.initializeBotNamespace(botFilters, sioServer);
    });

    afterEach((done) => {
      testUtil.toggleOverride('useOldNamespaceFormat', false);
      testUtil.toggleOverride('useNewNamespaceFormat', false);
      client && client.close();
      sioServer.close(done);
    });

    describe('basic', () => {
      it('connect perspective', () =>
        connectUtil.connectPerspectiveOldFormat(sioServer, perspectiveFilters, token)
        .then((client) => {
          client.close();
        })
      );

      it('connect bot', () =>
        connectUtil.connectBotOldFormat(sioServer, botFilters, token)
        .then((client) => {
          client.close();
        })
      );

      it('connect room', () =>
        connectUtil.connectRoomOldFormat(sioServer, roomFilters, token)
        .then((client) => {
          client.close();
        })
      );
    });

    describe('auth', () => {
      it('token not sent (fail)', () => {
        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {},
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitDisconnect(client)
                          .should.eventually.equal('Access denied: no token provided');
      });

      it('token sent as auth event (fail)', () => {
        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {},
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options)
        .on('connect', function() {
          this.emit('auth', token);
        });

        return connectUtil.awaitDisconnect(client)
                          .should.eventually.equal('Access denied: no token provided');
      });

      it('token sent as query param (success)', () => {
        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitConnect(client)
                          .should.eventually.be.fulfilled;
      });

      it('invalid token (fail)', () => {
        const jwtClaim = {
          tokenname: 'token2',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, 'incorrectsecret...');

        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitDisconnect(client)
                          .should.eventually.equal('invalid signature');
      });

      it('valid token for nonexistent user (success)', () => {
        const jwtClaim = {
          tokenname: 'token1',
          username: 'user0',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitConnect(client)
                          .should.eventually.be.fulfilled;
      });

      it('valid token for existing user but nonexistent token name (success)', () => {
        const jwtClaim = {
          tokenname: 'token0',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitConnect(client)
                          .should.eventually.be.fulfilled;
      });

      it('valid token for existing user and token name, but incorrect timestamp (success)', () => {
        const jwtClaim = {
          tokenname: 'token1',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const nsp = utils.getPerspectiveNamespaceString(perspectiveFilters);
        const options = {
          query: {
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000${nsp}`, options);
        return connectUtil.awaitConnect(client)
                          .should.eventually.be.fulfilled;
      });
    });
  });

  describe('new format', () => {
    let sioServer;
    let client;

    beforeEach(() => {
      testUtil.toggleOverride('useOldNamespaceFormat', false);
      testUtil.toggleOverride('useNewNamespaceFormat', true);
      sioServer = require('socket.io')(3000);
      utils.initializeNamespace('/bots', sioServer);
      utils.initializeNamespace('/rooms', sioServer);
      utils.initializeNamespace('/perspectives', sioServer);
    });

    afterEach((done) => {
      testUtil.toggleOverride('useOldNamespaceFormat', false);
      testUtil.toggleOverride('useNewNamespaceFormat', false);
      client && client.close();
      sioServer.close(done);
    });

    describe('basic', () => {
      it('connect perspective', () =>
        connectUtil.connectPerspectiveNewFormat(sioServer, perspectiveFilters, token)
        .then((client) => {
          client.close();
        })
      );

      it('connect bot', () =>
        connectUtil.connectBotNewFormat(sioServer, botFilters, token)
        .then((client) => {
          client.close();
        })
      );

      it('connect room', () =>
        connectUtil.connectRoomNewFormat(sioServer, roomFilters, token)
        .then((client) => {
          client.close();
        })
      );
    });

    describe('auth', () => {
      it('token not sent (fail)', () => {
        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options);
        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('operation timed out');
      });

      it('token sent as query param (fail)', () => {
        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
            t: token,
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options);
        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('operation timed out');
      });

      it('token sent as auth event (success)', () => {
        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options)
                       .on('connect', function() {
                         this.emit('auth', token);
                       });

        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.fulfilled;
      });

      it('invalid token (fail)', () => {
        const jwtClaim = {
          tokenname: 'token2',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, 'incorrectsecret...');

        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options)
        .on('connect', function() {
          this.emit('auth', token);
        });

        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('invalid signature');
      });

      it('valid token for nonexistent user (fail)', () => {
        const jwtClaim = {
          tokenname: 'token1',
          username: 'user0',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options)
        .on('connect', function() {
          this.emit('auth', token);
        });

        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('Not Found');
      });

      it('valid token for existing user but nonexistent token name (fail)', () => {
        const jwtClaim = {
          tokenname: 'token0',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options)
        .on('connect', function() {
          this.emit('auth', token);
        });

        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('Not Found');
      });

      it('valid token for existing user and token name, but incorrect timestamp (fail)', () => {
        const jwtClaim = {
          tokenname: 'token1',
          username: 'user1',
          timestamp: Date.now(),
        };
        const token = jwt.sign(jwtClaim, conf.secret);

        const options = {
          query: {
            id: utils.getPerspectiveNamespaceString(perspectiveFilters),
          },
          transports: ['websocket'],
        };

        client = sioClient(`http://localhost:3000/perspectives`, options)
        .on('connect', function() {
          this.emit('auth', token);
        });

        return connectUtil.awaitAuthenticate(client)
                          .should.eventually.be.rejectedWith('Unauthorized');
      });
    });
  });
});


