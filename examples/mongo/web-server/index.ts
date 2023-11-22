import * as express from 'express';
import { MikroORM, type MongoDriver } from '@mikro-orm/mongodb';

require('dotenv').config();

const app = express.default();

app.use('/', async (req: any, res: any) => {
  await MikroORM.init<MongoDriver>({
    clientUrl: process.env.MONGO_URL,
    type: 'mongo',
    dbName: 'admin',
    user: process.env.MONGO_USERNAME,
    password: process.env.MONGO_PASSWORD,
    discovery: {
      warnWhenNoEntities: false,
    },
  })
    .then(async orm => {
      const isConnected = await orm.isConnected();
      res.send(`Database connected: ${isConnected}`);
    })
    .catch(err => {
      res.send(`Error connecting to database: ${err}`);
    });
});

app.listen(3000, () => {
  console.log('App is listening on port 3000');
});
