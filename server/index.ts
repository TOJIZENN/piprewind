import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { apiMiddleware } from './api.ts';

const dist = path.resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT) || 4173;

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const app = express();
app.use(apiMiddleware);
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(port, () => console.log(`PipRewind is running at http://localhost:${port}`));
