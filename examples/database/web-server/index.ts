import * as express from 'express';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';

require('dotenv').config();

const app = express.default();

app.use('/', async (req: any, res: any) => {
  await MikroORM.init<PostgreSqlDriver>({
    clientUrl: process.env.DB_URL,
    dbName: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
    type: 'postgresql',
    discovery: {
      warnWhenNoEntities: false,
    },
  })
    .then(async orm => {
      const isConnected = await orm.isConnected();
      res.send(`Database connected: ${isConnected}`);
    })
    .catch(err => {
      console.log(err);
      res.send(`Error connecting to database: ${err}`);
    });
});

app.listen(3000, () => {
  console.log('App is listening on port 3000');
});
