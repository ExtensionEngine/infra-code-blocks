import * as express from 'express';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { RequestContext } from '@mikro-orm/core';
import { Post } from './database/entities/post.entity';

const app = express.default();

export const init = (async () => {
  const orm = await MikroORM.init<PostgreSqlDriver>();

  app.use(express.json());

  app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
  });

  app.use('/', async (req: any, res: any) => {
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

  app.listen(3000, () => {
    console.log('App is listening on port 3000');
  });
})();