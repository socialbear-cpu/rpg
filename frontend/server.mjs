import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.FRONTEND_PORT || 4173);
const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
    try {
      const hopByHopHeaders = new Set(['connection', 'content-length', 'expect', 'host', 'keep-alive', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
      const headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name, value]) => value !== undefined && !hopByHopHeaders.has(name.toLowerCase())),
      );
      const upstream = await fetch(new URL(url.pathname + url.search, apiTarget), {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request,
        duplex: 'half',
      });
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Backend indisponível. Confira API_PROXY_TARGET.' }));
    }
    return;
  }

  let filePath = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!filePath.startsWith(root + sep) && filePath !== resolve(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`UI de validação: http://localhost:${port}`);
  console.log(`Proxy de API: ${apiTarget}`);
});
