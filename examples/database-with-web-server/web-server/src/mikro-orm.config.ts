require('dotenv').config();

import { defineConfig } from '@mikro-orm/postgresql';
import { Post } from './database/entities/post.entity';

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
});
