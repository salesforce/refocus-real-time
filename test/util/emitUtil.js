/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/util/emitUtil.js
 */
'use strict'; // eslint-disable-line strict
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-as-promised'));
chai.should();
const Promise = require('bluebird');
const sinon = require('sinon');
const emitter = require('../../src/emitter');
const u = require('../../src/util/emitUtils');

const sampleUpdate = 'refocus.internal.realtime.sample.update';
const subjectUpdate = 'refocus.internal.realtime.subject.update';
const aspectUpdate = 'refocus.internal.realtime.aspect.update';
const roomUpdate = 'refocus.internal.realtime.room.settingsChanged';
const botActionUpdate = 'refocus.internal.realtime.bot.action.update';
const botDataUpdate = 'refocus.internal.realtime.bot.data.update';
const botEventUpdate = 'refocus.internal.realtime.bot.event.update';

const perspectiveTestFuncMap = {
  testSampleUpdate: sampleUpdate,
  testSubjectUpdate: subjectUpdate,
  testAspectUpdate: aspectUpdate,
};

const botRoomTestFuncMap = {
  testBotActionUpdate: botActionUpdate,
  testBotDataUpdate: botDataUpdate,
  testBotEventUpdate: botEventUpdate,
  testRoomUpdate: roomUpdate,
};

module.exports = {
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
      tags,
    };
  },

  textToAspect(text) {
    const regex = /^(\S+?):?\s*(\[.*?\])?$/;
    const result = regex.exec(text);
    const [match, name, tagsStr] = result;
    const tags = tagsStr && tagsStr.replace(/[\[\]\s]/g, '').split(',') || [];

    return {
      name,
      timeout: '60s',
      tags,
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
};

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
  .timeout(100)
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
