import { Migration } from '@mikro-orm/migrations-mongodb';
import { Post } from '../entities/post.entity';
import { posts } from '../seed/posts';

const COLLECTION = 'posts';

export class Migration20231127135423_add_posts extends Migration {
  async up(): Promise<void> {
    const postsCollection = this.getCollection(COLLECTION);

    const mappedPosts = posts.map(post => new Post(post.name, post.content));
    postsCollection.insertMany(mappedPosts);
  }

  async down(): Promise<void> {
    this.getCollection(COLLECTION).drop();
  }
}
