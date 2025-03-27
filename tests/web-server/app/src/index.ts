import * as express from 'express';

const PORT = 3000;
const app = express.default();

app.use(express.json());

app.use('/healthcheck', (_: any, res: any) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}`);
});
