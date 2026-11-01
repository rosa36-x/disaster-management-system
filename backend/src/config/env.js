require('dotenv').config({ quiet: true });

const required = [
  'MYSQL_HOST',
  'MYSQL_USER',
  'MYSQL_DATABASE',
  'MONGO_URI',
  'MONGO_DB',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  mysql: {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
  },
  mongo: {
    uri: process.env.MONGO_URI,
    dbName: process.env.MONGO_DB,
  },
};
