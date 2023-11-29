import type { Knex } from 'knex';

require('dotenv').config();

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_CONNECTION_STRING,
    migrations: {
      directory: 'src/migrations',
    },
  },
};

module.exports = config;
