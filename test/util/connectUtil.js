/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/util/connectUtil.js
 */
'use strict'; // eslint-disable-line strict
const Promise = require('bluebird');
const sioClient = require('socket.io-client');
const u = require('../../util/emitUtils');

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

  bindOpenCloseByClient(clients) {
    return (clientOpenClose) => openCloseByClient({
      clientOpenClose: clients.map((client, i) => [clientOpenClose[i], client]),
    });
  },

  connectPerspectivesOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getPerspectiveNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectPerspectiveOldFormat(sioServer, filters, token) {
    const namespaceFunc = u.getPerspectiveNamespaceString;
    return connectClientOldFormat(sioServer, namespaceFunc, filters, token);
  },

  connectPerspectivesNewFormat(sioServer, clientFilters, token) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectClientsNewFormat(sioServer, '/perspectives', idFunc, clientFilters, token);
  },

  connectBotsOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectBotOldFormat(sioServer, filters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientOldFormat(sioServer, namespaceFunc, filters, token);
  },

  connectBotsNewFormat(sioServer, clientFilters, token) {
    const idFunc = b => b.id;
    return connectClientsNewFormat(sioServer, '/bots', idFunc, clientFilters, token);
  },

  connectRoomsOldFormat(sioServer, clientFilters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token);
  },

  connectRoomOldFormat(sioServer, filters, token) {
    const namespaceFunc = u.getBotsNamespaceString;
    return connectClientOldFormat(sioServer, namespaceFunc, filters, token);
  },

  connectRoomsNewFormat(sioServer, clientFilters, token) {
    const idFunc = r => r.id;
    return connectClientsNewFormat(sioServer, '/rooms', idFunc, clientFilters, token);
  },

  connectPerspectiveNewFormat(sioServer, filters, token, autoConnect=true) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectClientNewFormat(sioServer, '/perspectives', idFunc, filters, token, autoConnect);
  },

  connectBotNewFormat(sioServer, filters, token, autoConnect=true) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectClientNewFormat(sioServer, '/bots', idFunc, filters, token, autoConnect);
  },

  connectRoomNewFormat(sioServer, filters, token, autoConnect=true) {
    const idFunc = u.getPerspectiveNamespaceString;
    return connectClientNewFormat(sioServer, '/rooms', idFunc, filters, token, autoConnect);
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

  awaitConnect,
  awaitDisconnect,
  awaitAuthenticate,
};

function openCloseByClient({ clientOpenClose }) {
  return Promise.all(clientOpenClose.map(([openClose, client]) => {
    if (openClose === true) {
      const awaitConnect = awaitAuthenticate(client);
      client.open();
      return awaitConnect;
    } else if (openClose === false) {
      const waitForDisconnect = awaitDisconnect(client);
      client.close();
      return waitForDisconnect.then(() => new Promise((resolve) => setTimeout(resolve, 50)));
    }
  }));
}

function connectClientsOldFormat(sioServer, namespaceFunc, clientFilters, token) {
  const clients = {};
  return Promise.map(Object.entries(clientFilters), ([name, filters]) =>
    connectClientOldFormat(sioServer, namespaceFunc, filters, token)
    .then((client) => {
      if (!clients[name]) clients[name] = [];
      clients[name].push(client);
    })
  )
  .then(() => clients);
}

function connectClientsNewFormat(sioServer, nsp, idFunc, clientFilters, token) {
  const clients = {};
  return Promise.map(Object.entries(clientFilters), ([name, filters]) =>
    connectClientNewFormat(sioServer, nsp, idFunc, filters, token)
    .then((client) => {
      if (!clients[name]) clients[name] = [];
      clients[name].push(client);
    })
  )
  .then(() => clients);
}

function connectClientOldFormat(sioServer, namespaceFunc, filters, token) {
  const namespace = namespaceFunc(filters);
  const awaitConnection = awaitConnect(sioServer.of(namespace));
  const client = connectOldFormat(namespace, token);
  return awaitConnection.then(() => client);
}

function connectClientNewFormat(sioServer, nsp, idFunc, filters, token, autoConnect=true) {
  const client = connectNewFormat(nsp, idFunc, filters, token, autoConnect);
  const awaitConnection = awaitAuthenticate(client);
  if (autoConnect) {
    return awaitConnection.then(() => client);
  } else {
    return client;
  }
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

function connectNewFormat(namespace, idFunc, filters, token, autoConnect=true) {
  const options = {
    query: {
      id: idFunc(filters),
    },
    transports: ['websocket'],
    autoConnect,
  };

  return sioClient(`http://localhost:3000${namespace}`, options)
  .on('connect', function() {
    this.emit('auth', token);
  });
}

function awaitConnect(target) {
  return new Promise((resolve, reject) => {
    let err = 'disconnected';
    target.once('connect', resolve);
    target.once('auth error', e => err = e);
    target.once('disconnect', () => reject(Error(err)));
  })
}

function awaitDisconnect(target) {
  return new Promise((resolve) => {
    let err = 'disconnected';
    target.once('auth error', e => err = e);
    target.once('disconnect', () => resolve(err));
  })
  .timeout(100);
}

function awaitAuthenticate(target) {
  return new Promise((resolve, reject) => {
    let err = 'disconnected';
    target.once('authenticated', resolve);
    target.once('auth error', e => err = e);
    target.once('disconnect', () => reject(Error(err)));
  })
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
