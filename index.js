/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * index.js
 *
 * Start the app.
 */
const throng = require('throng');
const conf = require('./conf/config');
const { start } = require('./src/start');

if (conf.isProd) {
  throng(conf.webConcurrency, start);
} else {
  start();
}
