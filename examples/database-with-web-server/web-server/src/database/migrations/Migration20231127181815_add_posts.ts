import { Migration } from '@mikro-orm/migrations';
import { posts } from '../seed/posts';
import { Post } from '../entities/post.entity';

const TABLE_NAME = 'posts';

export class Migration20231127181815_add_posts extends Migration {
  async up(): Promise<void> {
    const knex = this.getKnex();

    await knex.schema.createTable(TABLE_NAME, table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('content', 9999).notNullable();
      table
        .timestamp('createdAt', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
    });

    const data = posts.map(post => new Post(post.name, post.content));
    return knex.batchInsert(TABLE_NAME, data);
  }

  async down(): Promise<void> {
    const knex = this.getKnex();

    return knex.schema.dropTable(TABLE_NAME);
  }
}
