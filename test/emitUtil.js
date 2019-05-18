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
const featureToggles = require('feature-toggles');
const emitter = require('../src/emitter');
const u = require('../util/emitUtils');

const sampleUpdate = 'refocus.internal.realtime.sample.update';
const subjectUpdate = 'refocus.internal.realtime.subject.update';
const roomUpdate = 'refocus.internal.realtime.room.settingsChanged';
const botActionUpdate = 'refocus.internal.realtime.bot.action.update';
const botDataUpdate = 'refocus.internal.realtime.bot.data.update';
const botEventUpdate = 'refocus.internal.realtime.bot.event.update';

const perspectiveTestFuncMap = {
  testSampleUpdate: sampleUpdate,
  testSubjectUpdate: subjectUpdate,
};

const botRoomTestFuncMap = {
  testBotActionUpdate: botActionUpdate,
  testBotDataUpdate: botDataUpdate,
  testBotEventUpdate: botEventUpdate,
  testRoomUpdate: roomUpdate,
};

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

  textToBotAction: (text) => module.exports.textToBot('botAction', text),
  textToBotEvent: (text) => module.exports.textToBot('botEvent', text),
  textToBotData: (text) => module.exports.textToBot('botData', text),

  textToBot(name, text) {
    const regex = /^\w+(\d),\s*\w+(\d)$/;
    const result = regex.exec(text);
    const [match, botId, roomId] = result;
    return {
      name,
      botId,
      roomId,
    };
  },

  textToRoom(text) {
    const regex = /^\w+(\d),\s*\[(.*?)\]$/;
    const result = regex.exec(text);
    const [match, id, botsStr] = result;
    const botStrings = botsStr.replace(/\s/g, '').split(',') || [];
    const bots = botStrings.map((botStr) => ({ id: botStr.match(/^\w+(\d)$/)[1] }));

    return {
      id,
      type: {
        bots,
      },
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
    return `${samp.name}${stags || atags ? `:${stags}${atags}` : ''} - ${samp.status}`;

    function tagsToText(tags) {
      return tags.length ? ` [${tags.reduce((a, b) => `${a}, ${b}`)}]` : '';
    }
  },

  setupTestFuncs({ sioServer, perspectiveClients, botClients, roomClients, expectOverrides }) {
    Object.assign(
      this,
      bindTestFuncs(
        { sioServer, perspectiveClients },
        emitAndExpectPerspectives,
        perspectiveTestFuncMap,
      ),
      bindTestFuncs(
        { sioServer, botClients, roomClients, expectOverrides },
        emitAndExpectBotsRooms,
        botRoomTestFuncMap,
      ),
    );
  },

  bindEmitAndExpectByClient({ sioServer, eventExpectations, clients }) {
    return (clientExpectations) => emitAndExpectByClient({
      sioServer,
      eventType: sampleUpdate,
      eventExpectations,
      clientExpectations: clients.map((client, i) => [clientExpectations[i], client]),
    });
  },

  bindEmitAndStubFilterCheck({ sioServer, eventType, eventBody, nspString }) {
    return (expected) => emitAndStubFilterCheck({
      sioServer,
      eventType: sampleUpdate,
      eventBody,
      nspString,
      expected,
    });
  },

  bindOpenCloseByClient(clients) {
    return (clientOpenClose) => openCloseByClient({
      clientOpenClose: clients.map((client, i) => [clientOpenClose[i], client]),
    });
  },

  connectPerspectivesOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getPerspectiveNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectPerspectivesNewFormat(sioServer, clientFilters, token) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectClientsNewFormat(sioServer, '/perspectives', idFunc, clientFilters, token);
  },

  connectBotsOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectBotsNewFormat(sioServer, clientFilters, token) {
    const idFunc = b => b.id;
    return connectClientsNewFormat(sioServer, '/bots', idFunc, clientFilters, token);
  },

  connectRoomsOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectRoomsNewFormat(sioServer, clientFilters, token) {
    const idFunc = r => r.id;
    return connectClientsNewFormat(sioServer, '/rooms', idFunc, clientFilters, token);
  },

  connectPerspectiveNewFormat(filters, token, opts) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectNewFormat('/perspectives', idFunc, filters, token, opts);
  },

  closeClients(clientMap) {
    Object.values(clientMap).forEach((clients) =>
      clients.forEach((client) =>
        client.close()
      )
    );
  },

  mergeClients(clients1, clients2) {
    const clients = {};
    [...Object.keys(clients1), ...Object.keys(clients2)].forEach((filterName) => {
      clients[filterName] = [...clients1[filterName], ...clients2[filterName]];
    });
    return clients;
  },

  toggleOverride(key, value) {
    featureToggles._toggles[key] = value;
  }, // toggleOverride
};

function openCloseByClient({ clientOpenClose }) {
  return Promise.all(clientOpenClose.map(([openClose, client]) => {
    if (openClose === true) {
      const awaitConnect = awaitEvent(client, 'authenticated');
      client.open();
      return awaitConnect;
    } else if (openClose === false) {
      const awaitDisconnect = awaitEvent(client, 'disconnect');
      client.close();
      return awaitDisconnect.then(() => new Promise((resolve) => setTimeout(resolve, 50)));
    }
  }));
}

function connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token) {
  const clients = {};
  return Promise.map(Object.entries(clientFilters), ([name, filters]) => {
    const namespace = namespaceFunc(filters);
    const awaitConnection = awaitEvent(sioServer.of(namespace), 'connection');
    if (!clients[name]) clients[name] = [];
    clients[name].push(connectOldFormat(namespace, token));
    return awaitConnection;
  })
  .then(() => clients);
}

function connectClientsNewFormat(sioServer, nsp, idFunc, clientFilters, token) {
  const namespace = sioServer.of(nsp);
  const clientCount = Object.keys(clientFilters).length;
  const awaitConnections = awaitMultiple(namespace, 'connection', clientCount);
  const clients = {};
  Object.entries(clientFilters).map(([name, filters]) => {
    if (!clients[name]) clients[name] = [];
    clients[name].push(connectNewFormat(nsp, idFunc, filters, token));
  });
  return awaitConnections.then(() => clients);
}

function connectOldFormat(namespace, token) {
  const options = {
    transports: ['websocket'],
    query: {
      t: token,
    },
  };

  return sioClient(`http://localhost:3000${namespace}`, options);
}

function connectNewFormat(namespace, idFunc, filters, token, opts) {
  const options = {
    query: {
      id: idFunc(filters),
    },
    transports: ['websocket'],
    ...opts,
  };

  return sioClient(`http://localhost:3000${namespace}`, options)
  .on('connect', function() {
    this.emit('auth', token);
  });
}

function emitAndExpectByClient({ sioServer, eventType, eventExpectations, clientExpectations }) {
  const eventExpectationsNone = eventExpectations.map(([expected, samp]) => [null, samp]);
  const trackedEventsByClient = clientExpectations.map(([expectForClient, client]) =>
    trackEvents(client, eventType)
  );
  eventExpectations.forEach(([expected, sampleText]) => {
    emitter(sioServer, eventType, module.exports.textToSample(sampleText));
  });
  return new Promise((resolve) => setTimeout(resolve, 50))
  .then(() => {
    clientExpectations.forEach(([expectForClient, client], i) => {
      client.removeAllListeners(eventType);
      const clientEventExpectations = expectForClient ? eventExpectations : eventExpectationsNone;
      const trackedEvents = trackedEventsByClient[i];
      clientEventExpectations.forEach(([expectEvent, sampleText]) => {
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
    u.shouldIEmitThisObj.restore();
  });
}

function trackEvents(target, eventType) {
  const trackedEvents = {};
  target.on(eventType, (eventBody) => {
    eventBody = JSON.parse(eventBody);
    const samp = eventBody[sampleUpdate].new;
    const eventName = module.exports.sampleToText(samp);
    if (!trackedEvents[eventName]) {
      trackedEvents[eventName] = 0;
    }

    trackedEvents[eventName]++;
  });
  return trackedEvents;
}

function bindTestFuncs(args1, funcToBind, testFuncs) {
  const ret = {};
  Object.entries(testFuncs).forEach(([name, eventType]) =>
    ret[name] = (args2) => funcToBind({
      ...args1,
      ...args2,
      eventType,
    })
  );
  return ret;
}

function emitAndExpectPerspectives({
    sioServer, perspectiveClients, eventType, eventBody, clientExpectations,
}) {
  const expecting = expectEvents(eventType, clientExpectations, perspectiveClients);
  emitter(sioServer, eventType, eventBody);
  return expecting;
}

const filterIndex = {
  [roomUpdate]: 0,
  [botActionUpdate]: 1,
  [botDataUpdate]: 2,
  [botEventUpdate]: 3,
};

function emitAndExpectBotsRooms({
    sioServer, botClients, roomClients, eventType, eventBody,
    botExpectations, roomExpectations, expectOverrides,
}) {
  const pubOpts = {
    client: 'pubBot',
    channel: 'botChannelName',
    filterIndex: filterIndex[eventType],
    filterField: eventType === 'event' ? 'id' : 'name',
  };
  const expecting = Promise.join(
    expectEvents(eventType, botExpectations, botClients, expectOverrides),
    expectEvents(eventType, roomExpectations, roomClients, expectOverrides),
  );
  emitter(sioServer, eventType, eventBody, pubOpts);
  return expecting;
}

function expectEvents(eventType, clientExpectations, clients, expectOverrides=[]) {
  return Promise.all(clientExpectations.map(([expected, filterName]) => {
    return Promise.all(clients[filterName].map((client, i) => {
      const override = expectOverrides[i];
      const localExpected = override !== undefined ? override : expected;
      const clientName = `${filterName} (${i})`;
      return expectEvent(eventType, localExpected, client, clientName);
    }))
  }));
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
