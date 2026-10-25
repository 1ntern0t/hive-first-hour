'use strict';
const checklist = require('./src/checklist.js');
const sender = require('./src/sender.js');

module.exports = { ...checklist, ...sender };
