// Serves the Rabby deploy page and the tested artifact on http://127.0.0.1:8547 only.
//   node deploy/mainnet/serve.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8547;
const here = path.dirname(fileURLToPath(import.meta.url));
const routes = {
  '/': [path.join(here, 'index.html'), 'text/html; charset=utf-8'],
  '/artifact.json': [path.resolve(here, '../../contracts/out/ReleaseSplit.sol/ReleaseSplit.json'), 'application/json'],
};

http
  .createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://127.0.0.1').pathname];
    if (req.method !== 'GET' || !route) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' });
    fs.createReadStream(route[0]).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Deploy page: http://127.0.0.1:${PORT}  (Ctrl+C to stop)`));
