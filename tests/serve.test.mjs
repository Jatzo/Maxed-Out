import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = createStaticServer(root);
let port;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(() => server.close());

// fetch tidies up dot segments before sending, so raw requests are used to test the path as an attacker writes it.
function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('JavaScript and module files are served as text/javascript', async () => {
  for (const path of ['/src/core/rng.js', '/serve.mjs']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers['content-type'], /^text\/javascript/);
  }
});

test('a JSON file gets its own type and a missing file is a 404', async () => {
  assert.match((await get('/package.json')).headers['content-type'], /^application\/json/);
  assert.equal((await get('/no-such-file.js')).status, 404);
});

test('paths that climb out of the folder are refused', async () => {
  for (const path of ['/../package.json', '/%2e%2e/%2e%2e/Windows/win.ini', '/..%5c..%5cWindows%5cwin.ini', '/src/../../x', '/%00']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('hidden folders such as .git are not served', async () => {
  assert.equal((await get('/.git/config')).status, 404);
});

test('only GET and HEAD are answered, and HEAD sends no body', async () => {
  assert.equal((await get('/package.json', 'POST')).status, 405);
  const head = await get('/package.json', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
});
