/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * src/namespaceInit.js
 *
 * Initialize the namespaces for clients to connect to.
 */
const debug = require('debug')('refocus-real-time:namespaces');
const req = require('superagent');
const Promise = require('bluebird');
const toggle = require('feature-toggles');
const utils = require('./util/emitUtils');
const conf = require('../conf/config');

module.exports = (io, processName) => {
  // NEW
  if (toggle.isFeatureEnabled('useNewNamespaceFormat')) {
    utils.initializeNamespace('/bots', io, processName);
    utils.initializeNamespace('/rooms', io, processName);
    utils.initializeNamespace('/perspectives', io, processName);
    return Promise.resolve();
  }

  // OLD
  const useOldFormatPersp= toggle.isFeatureEnabled('useOldNamespaceFormatPersp');
  const useOldFormatImc = toggle.isFeatureEnabled('useOldNamespaceFormatImc');
  return Promise.join(
    useOldFormatPersp && utils.initializePerspectiveNamespacesFromApi(io),
    useOldFormatImc && utils.initializeBotNamespacesFromApi(io),
  );
};
