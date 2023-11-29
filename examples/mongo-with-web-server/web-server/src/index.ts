import * as express from 'express';
import { MikroORM, type MongoDriver } from '@mikro-orm/mongodb';
import { RequestContext } from '@mikro-orm/core';
import { Post } from './mongo/entities/post.entity';

const app = express.default();

export const init = (async () => {
  const orm = await MikroORM.init<MongoDriver>();

  app.use(express.json());

  app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
  });

  app.use('/mongo', async (req: any, res: any) => {
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
