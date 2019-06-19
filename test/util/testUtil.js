/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * test/util/testUtil.js
 */
'use strict'; // eslint-disable-line strict
const featureToggles = require('feature-toggles');

module.exports = {
  toggleOverride(key, value) {
    featureToggles._toggles[key] = value;
  }, // toggleOverride
};
