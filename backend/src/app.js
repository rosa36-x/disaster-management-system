const express = require('express');
const cors = require('cors');
const { corsOrigin } = require('./config/env');
const pool = require('./db/mysql');
const { getMongoDb } = require('./db/mongo');

const app = express();

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Reports whether each database is reachable. Returns 503 if either is down.
app.get('/api/health', async (req, res) => {
  const status = { mysql: 'up', mongo: 'up' };

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    status.mysql = 'down';
  }

  try {
    await getMongoDb().command({ ping: 1 });
  } catch (err) {
    status.mongo = 'down';
  }

  const healthy = status.mysql === 'up' && status.mongo === 'up';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', ...status });
});

// Unknown route
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler: any error passed to next(err) ends up here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
