import { readFileSync } from 'fs';
import type { Knex } from 'knex';

require('dotenv').config();

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
    },
    migrations: {
      directory: 'src/migrations',
    },
  },
};

export default knexConfig;
