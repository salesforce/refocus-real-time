/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/emitUtil.js
 */
'use strict'; // eslint-disable-line strict
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-as-promised'));
chai.should();
const Promise = require('bluebird');
const sinon = require('sinon');
const sioClient = require('socket.io-client');
const emitter = require('../src/emitter');
const u = require('../util/emitUtils');

const sampleUpdate = 'refocus.internal.realtime.sample.update';
const subjectUpdate = 'refocus.internal.realtime.subject.update';
const roomUpdate = 'refocus.internal.realtime.room.settingsChanged';
const botActionUpdate = 'refocus.internal.realtime.bot.action.update';
const botDataUpdate = 'refocus.internal.realtime.bot.data.update';
const botEventUpdate = 'refocus.internal.realtime.bot.event.update';

module.exports = {
  buildFilters(filters) {
    const base = {
      rootSubject: 'root',
      subjectTagFilterType: 'EXCLUDE',
      subjectTagFilter: [],
      aspectFilterType: 'EXCLUDE',
      aspectFilter: [],
      aspectTagFilterType: 'EXCLUDE',
      aspectTagFilter: [],
      statusFilterType: 'EXCLUDE',
      statusFilter: [],
    };

    Object.entries(filters).forEach(([type, val]) => {
      Object.assign(base, filterBuilders[type](val))
    });
    return base;
  },

  textToBotAction(text) {
    const name = 'botAction1';
    const regex = /^(\S+?),\s*(\S+?)$/;
    const result = regex.exec(text);
    const [match, bot, room] = result;
    return {
      name,
      bot,
      room,
    };
  },

  textToBotData(text) {
    const name = 'botData1';
    const regex = /^(\S+?),\s*(\S+?)$/;
    const result = regex.exec(text);
    const [match, bot, room] = result;
    return {
      name,
      bot,
      room,
    };
  },

  textToBotEvent(text) {
    const name = 'botEvent1';
    const regex = /^(\S+?),\s*(\S+?)$/;
    const result = regex.exec(text);
    const [match, bot, room] = result;
    return {
      name,
      bot,
      room,
    };
  },

  textToRoom(text) {
    const regex = /^(\S+?),\s*\[(.*?)\]$/;
    const result = regex.exec(text);
    const [match, name, botsStr] = result;
    const bots = botsStr.replace(/\s/g, '').split(',') || [];
    return {
      name,
      bots,
    };
  },

  textToSubject(text) {
    const regex = /^(\S+?):?\s*(\[.*?\])?$/;
    const result = regex.exec(text);
    const [match, absolutePath, tagsStr] = result;
    const absPathSplit = absolutePath.split('.');
    const name = absPathSplit[absPathSplit.length - 1];
    const parentAbsolutePath = absPathSplit.slice(0, absPathSplit.length -1).join('.');

    const tags = tagsStr && tagsStr.replace(/[\[\]\s]/g, '').split(',') || [];

    return {
      parentAbsolutePath,
      absolutePath,
      name,
      tags: tags,
    };
  },

  textToSample(text) {
    const regex = /^(\S+?):?\s*(\[.*?\])?\s*(\[.*?\])?\s*-\s*(\w+)$/;
    const result = regex.exec(text);
    const [match, name, tagsStr1, tagsStr2, status] = result;
    const nameSplit = name.split('|');
    const [absolutePath, aspectName] = nameSplit;
    const absPathSplit = absolutePath.split('.');
    const subName = absPathSplit[absPathSplit.length - 1];
    let stagsStr;
    let atagsStr;
    if (tagsStr1 && tagsStr1.includes('stag')) {
      stagsStr = tagsStr1;
    } else if (tagsStr1 && tagsStr1.includes('atag')) {
      atagsStr = tagsStr1;
    }

    if (tagsStr2 && tagsStr2.includes('stag')) {
      stagsStr = tagsStr2;
    } else if (tagsStr2 && tagsStr2.includes('atag')) {
      atagsStr = tagsStr2;
    }

    const stags = stagsStr && stagsStr.replace(/[\[\]\s]/g, '').split(',') || [];
    const atags = atagsStr && atagsStr.replace(/[\[\]\s]/g, '').split(',') || [];

    return {
      name,
      absolutePath,
      status,
      subject: {
        name: subName,
        tags: stags,
      },
      aspect: {
        name: aspectName,
        tags: atags,
      },
    };
  },

  sampleToText(samp) {
    const stags = tagsToText(samp.subject.tags);
    const atags = tagsToText(samp.aspect.tags);
    return `${samp.name}: ${stags} ${atags} - ${samp.status}`;

    function tagsToText(tags) {
      return tags.length ? `[${tags.reduce((a, b) => `${a}, ${b}`)}]` : '';
    }
  },

  bindEmitAndExpect(sioServer, clients, eventType) {
    return ({ eventBody, clientExpectations }) => emitAndExpect({
      sioServer,
      clients,
      eventType,
      eventBody,
      clientExpectations,
    });
  },

  bindEmitAndExpectBots(sioServer, botClients, roomClients, eventType) {
    return ({ eventBody, botExpectations, roomExpectations }) => emitAndExpectBots({
      sioServer,
      botClients,
      roomClients,
      eventType,
      eventBody,
      botExpectations,
      roomExpectations,
    });
  },

  bindEmitAndExpectByClient(sioServer, eventType, eventExpectations, clients) {
    return (clientExpectations) => emitAndExpectByClient({
      sioServer,
      eventType,
      eventExpectations,
      clientExpectations: clients.map((client, i) => [clientExpectations[i], client]),
    });
  },

  bindEmitAndStubFilterCheck(sioServer, eventType, nspString) {
    return (expected) => emitAndStubFilterCheck({
      sioServer,
      eventType,
      eventBody,
      nspString,
      expected,
    });
  },

  bindOpenCloseByClient(clients) {
    return (clientOpenClose) => openCloseByClient({
      sioServer,
      clientOpenClose: clients.map((client, i) => [clientOpenClose[i], client]),
    });
  },

  emitAndExpectByClient,

  connectClientsNewFormat(sioServer, clientFilters, token) {
    const namespace = sioServer.of('perspectives');
    const awaitConnections = awaitMultiple(namespace, 'connection', Object.keys(clientFilters).length);
    const clients = {};
    Object.entries(clientFilters).map(([name, filters]) => {
      if (!clients[name]) clients[name] = [];
      clients[name].push(connectClientNewFormat(filters, token));
    });
    return awaitConnections.then(() => clients);
  },

  connectClientsOldFormat(sioServer, clientFilters, token) {
    const clients = {};
    return Promise.map(Object.entries(clientFilters), ([name, filters]) => {
      const namespace = u.getPerspectiveNamespaceString(filters);
      const awaitConnection = awaitEvent(sioServer.of(namespace), 'connection');
      if (!clients[name]) clients[name] = [];
      clients[name].push(this.connectClientOldFormat(filters, token));
      return awaitConnection;
    })
    .then(() => clients);
  },

  connectBotClientsOldFormat(sioServer, clientFilters, token) {
    const clients = {};
    return Promise.map(Object.entries(clientFilters), ([name, filters]) => {
      const namespace = u.getBotsNamespaceString(filters);
      const awaitConnection = awaitEvent(sioServer.of(namespace), 'connection');
      if (!clients[name]) clients[name] = [];
      clients[name].push(this.connectBotClientOldFormat(filters, token));
      return awaitConnection;
    })
    .then(() => clients);
  },

  connectRoomClientsOldFormat(sioServer, clientFilters, token) {
    const clients = {};
    return Promise.map(Object.entries(clientFilters), ([name, filters]) => {
      const namespace = u.getBotsNamespaceString(filters);
      const awaitConnection = awaitEvent(sioServer.of(namespace), 'connection');
      if (!clients[name]) clients[name] = [];
      clients[name].push(this.connectBotClientOldFormat(filters, token));
      return awaitConnection;
    })
    .then(() => clients);
  },

  connectClientNewFormat(filters, token, opts) {
    const options = {
      query: {
        id: u.getPerspectiveNamespaceString(filters),
      },
      transports: ['websocket'],
      extraHeaders: {
        authorization: token,
      },
      ...opts,
    };

    return sioClient('http://localhost:3000/perspectives', options);
  },

  connectClientOldFormat(filters, token) {
    const namespace = u.getPerspectiveNamespaceString(filters);
    const options = {
      transports: ['websocket'],
      query: {
        t: token,
      },
    };

    return sioClient(`http://localhost:3000${namespace}`, options);
  },

  connectBotClientOldFormat(filters, token) {
    const namespace = u.getBotsNamespaceString(filters);
    const options = {
      transports: ['websocket'],
      query: {
        t: token,
      },
    };

    return sioClient(`http://localhost:3000${namespace}`, options);
  },
};

function openCloseByClient({ sioServer, clientOpenClose }) {
  Object.entries(clientOpenClose).forEach(([openClose, client]) => {
    if (openClose === true) {
      client.open();
    } else if (openClose === false) {
      client.close();
    }
  });
}

function emitAndExpectByClient({ sioServer, eventType, eventExpectations, clientExpectations }) {
  const eventExpectationsNone = eventExpectations.map(([expected, samp]) => [_, samp]);
  const trackedEventsByClient = {};
  Object.values(clientExpectations).forEach((client) => {
    trackedEventsByClient[client.name] = trackEvents(client, eventType);
  });
  Object.entries(eventExpectations).forEach(([expected, sampleText]) => {
    emitter(sioServer, eventType, exports.textToSample(sampleText));
  });
  return new Promise((resolve) => setTimeout(resolve, 50))
  .then(() => {
    Object.entries(clientExpectations).forEach(([expectForClient, client]) => {
      client.removeAllListeners();
      const clientEventExpectations = expectForClient ? eventExpectations : eventExpectationsNone;
      const trackedEvents = trackedEventsByClient[client.name];
      Object.entries(clientEventExpectations).forEach(([expectEvent, sampleText]) => {
        if (expectEvent) {
          expect(trackedEvents[sampleText]).to.exist;
        } else {
          expect(trackedEvents[sampleText]).to.not.exist;
        }
      });
    });
  });
}

function emitAndStubFilterCheck({ sioServer, eventType, eventBody, nspString, expected }) {
  const spy = sinon.spy(u, 'shouldIEmitThisObj').withArgs(nspString);
  emitter(sioServer, eventType, eventBody);
  return new Promise((resolve) => setTimeout(resolve, 50))
  .then(() => {
    expect(spy.called).to.equal(expected);
  });
}

function trackEvents(target, eventType) {
  const trackedEvents = {};
  return new Promise((resolve) => {
    target.on(eventType, (eventBody) => {
      const eventName = sampleToText(eventBody);
      if (trackedEvents[eventName]) {
        trackedEvents[eventName] = 0;
      }

      trackedEvents[eventName]++;
    });
  });
}

function emitAndExpect({ sioServer, clients, eventType, eventBody, clientExpectations }) {
  const expecting = expectEvents(eventType, clientExpectations, clients);
  emitter(sioServer, eventType, eventBody);
  return expecting;
}

const filterIndex = {
  [roomUpdate]: 0,
  [botActionUpdate]: 1,
  [botDataUpdate]: 2,
  [botEventUpdate]: 3,
};
function emitAndExpectBots({ sioServer, botClients, roomClients, eventType, eventBody, botExpectations, roomExpectations }) {
  const pubOpts = {
    client: 'pubBot',
    channel: 'botChannelName',
    filterIndex: filterIndex[eventType],
    filterField: eventType === 'event' ? 'id' : 'name',
  };
  const expecting = Promise.join(
    expectEvents(eventType, botExpectations, botClients),
    expectEvents(eventType, roomExpectations, roomClients),
  );
  emitter(sioServer, eventType, eventBody, pubOpts);
  return expecting;
}

function expectEvents(eventType, clientExpectations, clients) {
  return Promise.all(clientExpectations.map(([expected, filterName]) =>
    Promise.all(clients[filterName].map((client, i) => {
      const clientName = `${filterName} (${i})`;
      return expectEvent(eventType, expected, client, clientName);
    }))
  ));
}

function expectEventsBots(eventType, botExpectations, roomExpectations, clients) {
  return Promise.join(
    Promise.all(botExpectations.map(([expected, filterName]) =>
      Promise.all(clients[filterName].map((client, i) => {
        const clientName = `${filterName} (${i})`;
        return expectEvent(eventType, expected, client, clientName);
      }))
    )),
    Promise.all(roomExpectations.map(([expected, filterName]) =>
      Promise.all(clients[filterName].map((client, i) => {
        const clientName = `${filterName} (${i})`;
        return expectEvent(eventType, expected, client, clientName);
      }))
    )),
  );
}

function expectEvent(eventType, expected, client, clientName) {
  const awaitPromise = awaitEvent(client, eventType)
  .then(() => clientName)
  .timeout(20)
  .catch((err) => {
    err.message += ': ' + clientName;
    return Promise.reject(err);
  });

  if (expected) {
    return awaitPromise.should.eventually.equal(clientName);
  } else {
    return awaitPromise.should.eventually.be.rejectedWith(Promise.TimeoutError);
  }
}

function awaitEvent(target, eventName) {
  return new Promise((resolve) =>
    target.once(eventName, resolve)
  )
}

function awaitMultiple(target, eventName, x) {
  let eventCount = 0;
  return new Promise((resolve) => {
    target.on(eventName, () => {
      eventCount++;
      if (eventCount >= x) {
        target.removeAllListeners();
        resolve();
      }
    });
  });
}

const filterBuilders = {
  rootSubject(rootSubject) {
    return {
      rootSubject,
    };
  },

  subjectTagInclude(tags) {
    return {
      subjectTagFilterType: 'INCLUDE',
      subjectTagFilter: tags,
    };
  },

  subjectTagExclude(tags) {
    return {
      subjectTagFilterType: 'EXCLUDE',
      subjectTagFilter: tags,
    };
  },

  aspectTagInclude(tags) {
    return {
      aspectTagFilterType: 'INCLUDE',
      aspectTagFilter: tags,
    };
  },

  aspectTagExclude(tags) {
    return {
      aspectTagFilterType: 'EXCLUDE',
      aspectTagFilter: tags,
    };
  },

  aspectNameInclude(names) {
    return {
      aspectFilterType: 'INCLUDE',
      aspectFilter: names,
    };
  },

  aspectNameExclude(names) {
    return {
      aspectFilterType: 'EXCLUDE',
      aspectFilter: names,
    };
  },

  statusFilterInclude(statuses) {
    return {
      statusFilterType: 'INCLUDE',
      statusFilter: statuses,
    };
  },

  statusFilterExclude(statuses) {
    return {
      statusFilterType: 'EXCLUDE',
      statusFilter: statuses,
    };
  },
};
