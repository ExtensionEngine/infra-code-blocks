import type { Knex } from 'knex';

require('dotenv').config();

const username = process.env.DATABASE_USERNAME;
const password = process.env.DATABASE_PASSWORD;
const host = process.env.DATABASE_HOST;
const dbName = process.env.DATABASE_DBNAME;
const isProd = process.env.NODE_ENV == 'production';

const connectionString = `postgres://${username}:${password}@${host}:5432/${dbName}`;

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      connectionString,
    },
    migrations: {
      directory: 'src/migrations',
    },
  },
  production: {
    client: 'postgresql',
    connection: {
      connectionString,
      ssl: { rejectUnauthorized: false },
    },
    migrations: {
      directory: 'src/migrations',
    },
  },
};

export default knexConfig;
