const debug = require('debug')('refocus-real-time');
const conf = require('./conf/config');
const namespaceInit = require('./src/namespaceInit');
const subscriberInit = require('./src/subscriberInit');

Object.entries(conf).forEach(([key, val]) => {
  if (val === undefined) throw new Error(`Config variable "${key}" is required.`);
});

const io = require('socket.io')(conf.port);
namespaceInit(io)
.then(() => subscriberInit(io));
