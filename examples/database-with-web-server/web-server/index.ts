import * as express from 'express';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';

require('dotenv').config();

const app = express.default();

app.use('/', async (req: any, res: express.Response) => {
  const orm = await MikroORM.init<PostgreSqlDriver>({
    host: process.env.DB_URL,
    port: 5432,
    dbName: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    type: 'postgresql',
    discovery: {
      warnWhenNoEntities: false,
    },
  });

  const isConnected = await orm.isConnected();
  res.send(`Connected to database: ${isConnected}`);
});

app.listen(3000, () => {
  console.log('App is listening on port 3000');
});
