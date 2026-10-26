// A small static file server for local play. Module scripts and the worker need http, not file://.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Works out which file a request path means, or null when it should be a 404. Anything that climbs out of the
 * folder, and any hidden file or folder such as .git, is refused.
 */
async function locate(root, requestUrl) {
  let pathname;
  try {
    // The raw path is used, not a parsed URL, because the URL parser quietly resolves any dot segments away.
    pathname = decodeURIComponent(requestUrl.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const segments = pathname.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) return null;

  let file = join(root, ...segments);
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    if (!(await stat(file)).isFile()) return null;
  } catch {
    return null;
  }
  return file;
}

export function createStaticServer(rootFolder) {
  const root = resolve(rootFolder);
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Only GET and HEAD are served here.');
      return;
    }
    const file = await locate(root, request.url);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found.');
      return;
    }
    // The file can vanish or be locked between the check and the read; a rejection here would stop the server.
    let body;
    try {
      body = await readFile(file);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 5173;
  const folder = fileURLToPath(new URL('.', import.meta.url));
  createStaticServer(folder).listen(port, '127.0.0.1', () => {
    console.log(`Maxed Out is running at http://127.0.0.1:${port}`);
  });
}
