import { Migration } from '@mikro-orm/migrations';

const TABLE_NAME = 'posts';

export class Migration20231127181815_add_posts extends Migration {
  async up(): Promise<void> {
    const knex = this.getKnex();

    const createPostsTable = knex.schema.createTable(TABLE_NAME, table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('content').notNullable();
      table
        .timestamp('createdAt', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
    });

    this.addSql(createPostsTable.toQuery());
  }

  async down(): Promise<void> {
    const knex = this.getKnex();

    this.addSql(knex.schema.dropTable(TABLE_NAME).toQuery());
  }
}
