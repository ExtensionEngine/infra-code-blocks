import * as express from 'express';
import { connect, Schema, model } from 'mongoose';
import { posts } from './postsSeed';

require('dotenv').config();

const app = express.default();

export const init = (async () => {
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const host = process.env.MONGO_HOST;
  const dbname = process.env.MONGO_DATABASE;
  const port = process.env.MONGO_PORT;

  const mongoConnectionString = `mongodb://${username}:${password}@${host}:${port}/${dbname}`;

  await connect(mongoConnectionString, {
    authSource: 'admin',
  });

  const Post = await createDatabaseWithPosts();

  app.use(express.json());

  app.use('/posts', async (req: any, res: any) => {
    const posts = await Post.find();
    return res.json(posts);
  });

  app.listen(3000, () => {
    console.log('App is listening on port 3000');
  });

  async function createDatabaseWithPosts() {
    const postSchema = new Schema({
      name: String,
      content: String,
    });
    const Post = model('Post', postSchema);

    const existingPosts = await Post.find();
    if (!existingPosts.length) {
      const mappedPosts = posts.map(post => new Post(post));
      await Post.bulkSave(mappedPosts);
    }

    return Post;
  }
})();
