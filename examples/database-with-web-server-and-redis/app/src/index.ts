import * as express from 'express';
import knexConfig from '../knexfile';
import { Redis } from 'ioredis';
import { knex } from 'knex';

const app = express.default();

require('dotenv').config();

const redisConnectionString = process.env.REDIS_CONNECTION_STRING || '';

const isProd = process.env.NODE_ENV == 'production';
const config = isProd ? knexConfig.production : knexConfig.development;

const knexClient = knex(config);
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
