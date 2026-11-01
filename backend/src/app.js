const express = require('express');
const cors = require('cors');
const { corsOrigin } = require('./config/env');
const pool = require('./db/mysql');
const { getMongoDb } = require('./db/mongo');
const authRoutes = require('./routes/auth');
const victimRoutes = require('./routes/victims');
const requestRoutes = require('./routes/requests');
const depotRoutes = require('./routes/depots');
const shelterRoutes = require('./routes/shelters');
const supplyRoutes = require('./routes/supplies');
const vehicleRoutes = require('./routes/vehicles');
const deliveryRoutes = require('./routes/delivery-routes');
const matchRoutes = require('./routes/matches');
const mapDbError = require('./utils/dbErrors');

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

app.use('/api/auth', authRoutes);
app.use('/api/victims', victimRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/depots', depotRoutes);
app.use('/api/shelters', shelterRoutes);
app.use('/api/supplies', supplyRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/routes', deliveryRoutes);

// Unknown route
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler: any error passed to next(err) ends up here.
app.use((err, req, res, next) => {
  // Known MySQL errors (duplicate, foreign key, CHECK, trigger SIGNAL...) become 4xx.
  const error = mapDbError(err);
  const status = error.status || 500;
  // Only log unexpected failures; 4xx errors are normal client mistakes.
  if (status >= 500) console.error(err);
  // Don't leak internal error details (SQL errors etc.) to the client.
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
});

module.exports = app;
