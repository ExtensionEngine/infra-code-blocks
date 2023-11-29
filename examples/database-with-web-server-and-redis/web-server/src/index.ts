import * as express from 'express';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RequestContext } from '@mikro-orm/core';
import { Post } from './database/entities/post.entity';
import { Redis } from 'ioredis';

const app = express.default();

require('dotenv').config();

export const init = (async () => {
  const orm = await MikroORM.init<PostgreSqlDriver>();

  const redisUrl = process.env.REDIS_URL || '';
  const redisClient = new Redis(redisUrl);

  app.use(express.json());

  app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
  });

  app.use('/database', async (req: any, res: any) => {
    try {
      const postRepository = orm.em.getRepository(Post);
      const posts = await postRepository.findAll();
      res.json(posts);
    } catch (error) {
      res.json({
        message: 'Error fetching posts',
        error,
      });
    }
  });

  app.get('/redis', async (req: any, res: any) => {
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
