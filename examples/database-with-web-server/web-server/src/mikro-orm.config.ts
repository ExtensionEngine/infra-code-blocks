require('dotenv').config();

import { defineConfig } from '@mikro-orm/postgresql';
import { Post } from './database/entities/post.entity';
import { readFileSync } from 'fs';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  entities: [Post],
  migrations: {
    path: 'dist/database/migrations',
    pathTs: 'src/database/migrations',
  },
  host: process.env.DB_URL,
  port: 5432,
  dbName: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  type: 'postgresql',
  driverOptions: isProd
    ? {
        connection: {
          ssl: { ca: readFileSync('./src/eu-north-1-bundle.pem') },
        },
      }
    : undefined,
});
