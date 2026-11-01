const { MongoClient } = require('mongodb');
const { mongo: cfg } = require('../config/env');

const client = new MongoClient(cfg.uri, { serverSelectionTimeoutMS: 3000 });

async function connectMongo() {
  await client.connect();
}

function getMongoDb() {
  return client.db(cfg.dbName);
}

module.exports = { client, connectMongo, getMongoDb };
