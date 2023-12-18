import * as express from 'express';
import knexConfig from '../knexfile';
import { Redis } from 'ioredis';
import { knex } from 'knex';

const app = express.default();

require('dotenv').config();

export const init = (async () => {
  const redisConnectionString = process.env.REDIS_CONNECTION_STRING || '';

  const knexClient = knex(knexConfig.development);
  const redisClient = new Redis(redisConnectionString);

  app.use(express.json());

  app.use('/posts', async (req: any, res: any) => {
    const posts = await knexClient('posts').select('*');

    return res.json({ posts });
  });

  app.get('/counters/visit', async (req: any, res: any) => {
    const COUNTER_KEY = 'VISIT_COUNTER';
    const counterResult = await redisClient.get(COUNTER_KEY);

    const counter = counterResult ? parseInt(counterResult) : 0;
    redisClient.set(COUNTER_KEY, counter + 1);

    return res.json({ visitCounter: counter + 1 });
  });

  app.listen(3000, () => {
    console.log('App is listening on port 3000');
  });
})();
