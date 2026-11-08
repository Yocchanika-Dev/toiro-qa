const express = require('express');
const { createApp } = require('../app');
const { createPool } = require('../db/pool');
// VercelのNode.js関数として、ローカルと同じExpressアプリを公開する。
module.exports = createApp(createPool());
