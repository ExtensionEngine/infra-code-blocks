import {
  Entity,
  Property,
  PrimaryKey,
  SerializedPrimaryKey,
} from '@mikro-orm/core';
import { ObjectId } from '@mikro-orm/mongodb';

@Entity({ tableName: 'posts' })
export class Post {
  @PrimaryKey()
  _id!: ObjectId;

  @SerializedPrimaryKey()
  id!: string;

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
