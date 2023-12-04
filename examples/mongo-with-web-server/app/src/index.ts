import * as express from 'express';
import { connect, Schema, model } from 'mongoose';
import { posts } from './postsSeed';

require('dotenv').config();

const app = express.default();

export const init = (async () => {
  const mongoConnectionString = process.env.MONGO_CONNECTION_STRING || '';
  await connect(mongoConnectionString, {
    authSource: 'admin',
  });
  const Post = await createDatabaseWithPosts();

  app.use(express.json());

  app.use('/mongo', async (req: any, res: any) => {
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
