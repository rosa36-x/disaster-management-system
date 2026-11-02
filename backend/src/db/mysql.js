const mysql = require('mysql2/promise');
const { mysql: cfg } = require('../config/env');

// A pool reuses connections across requests instead of opening one per query.
const pool = mysql.createPool({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
  waitForConnections: true,
  connectionLimit: 10,
  // Return DECIMAL (e.g. latitude/longitude) as numbers, not strings.
  decimalNumbers: true,
});

module.exports = pool;
