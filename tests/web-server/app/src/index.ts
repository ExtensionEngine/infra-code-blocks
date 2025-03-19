import * as express from 'express';

const app = express.default();

app.use(express.json());

app.use('/healthcheck', async (req: any, res: any) => {
  return res.send('OK');
});


app.listen(3000, () => {
  console.log('App is listening on port 3000');
});
