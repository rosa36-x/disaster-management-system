const { port } = require('./config/env');
const app = require('./app');
const pool = require('./db/mysql');
const { client, connectMongo, getMongoDb } = require('./db/mongo');
const { ensureMongoSchema } = require('./db/mongoSchema');

async function start() {
  // Fail fast: don't accept requests if a database is unreachable.
  try {
    await pool.query('SELECT 1');
    console.log('MySQL connected');
  } catch (err) {
    console.error(`MySQL connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    await connectMongo();
    console.log('MongoDB connected');
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    await ensureMongoSchema(getMongoDb());
    console.log('MongoDB validators and indexes ready');
  } catch (err) {
    console.error(`MongoDB schema setup failed: ${err.message}`);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });

  // Close connections cleanly on Ctrl+C / docker stop.
  const shutdown = async () => {
    server.close();
    await pool.end();
    await client.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
