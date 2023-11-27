import { Entity, Property, PrimaryKey } from '@mikro-orm/core';

@Entity({ tableName: 'posts' })
export class Post {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property()
  content!: string;

  @Property()
  createdAt: Date = new Date();

  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
  }
}
