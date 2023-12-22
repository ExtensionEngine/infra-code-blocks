import * as express from 'express';
import knexConfig from '../knexfile';
import { Redis } from 'ioredis';
import { knex } from 'knex';

const COUNTER_KEY = 'VISIT_COUNTER';

const app = express.default();

require('dotenv').config();

const redisPort = process.env.REDIS_PORT;
const redisHost = process.env.REDIS_HOST;
const redisPassword = process.env.REDIS_PASSWORD;

if (!redisPort || !redisHost || !redisPassword)
  throw new Error('Invalid redis configuration');

const redisClient = new Redis({
  port: parseInt(redisPort),
  host: redisHost,
  password: redisPassword,
  tls: {},
});

const isProd = process.env.NODE_ENV == 'production';
const config = isProd ? knexConfig.production : knexConfig.development;
const knexClient = knex(config);

app.use(express.json());

app.use('/posts', async (req: any, res: any) => {
  const posts = await knexClient('posts').select('*');

  const counter = await getVisitCounter();
  redisClient.set(COUNTER_KEY, counter + 1);

  return res.json({ posts });
});

app.get('/counters/visit', async (req: any, res: any) => {
  const counter = await getVisitCounter();
  return res.json({ visitCounter: counter });
});

async function getVisitCounter() {
  const counterResult = await redisClient.get(COUNTER_KEY);
  return counterResult ? parseInt(counterResult) : 0;
}

app.listen(3000, () => {
  console.log('App is listening on port 3000');
});
