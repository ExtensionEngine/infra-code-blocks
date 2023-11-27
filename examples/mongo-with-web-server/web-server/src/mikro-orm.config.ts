require('dotenv').config();
import { defineConfig } from '@mikro-orm/mongodb';
import { Post } from './mongo/entities/post.entity';

export default defineConfig({
  entities: [Post],
  migrations: {
    path: 'dist/mongo/migrations',
    pathTs: 'src/mongo/migrations',
    transactional: false,
  },
  clientUrl: process.env.MONGO_URL,
  type: 'mongo',
  dbName: process.env.MONGO_DB,
});
