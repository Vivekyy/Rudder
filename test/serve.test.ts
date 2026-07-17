import { once } from 'node:events';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempHome } from './helpers.ts';

async function freePort(): Promise<number> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForOutput(
  stream: NodeJS.ReadableStream,
  pattern: RegExp,
  timeoutMs = 5000
): Promise<string> {
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${pattern}; saw ${output}`));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (pattern.test(output)) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
  return output;
}

test('serve exposes dashboard, asset, status, and notify routes', async () => {
  const home = useTempHome('rudder-serve-test-');
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [join(process.cwd(), 'bin', 'rudder.ts'), 'start', '--agent', 'claude', '--no-open'],
    {
      env: {
        ...process.env,
        HOME: home.path,
        RUDDER_HOME: home.path,
        RUDDER_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  try {
    const output = await waitForOutput(child.stdout!, /dashboard at/);
    assert.match(output, new RegExp(`127\\.0\\.0\\.1:${port}`));

    const base = `http://127.0.0.1:${port}`;
    const rules = await fetch(`${base}/api/rules`);
    assert.equal(rules.status, 200);
    assert.equal(rules.headers.get('content-type'), 'application/json');
    assert.deepEqual(await rules.json(), { active_rules: [], pending_prompts: 0 });

    const notify = await fetch(`${base}/notify`, { method: 'POST' });
    assert.equal(notify.status, 204);

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(await manifest.text(), /Rudder/);

    const serviceWorker = await fetch(`${base}/sw.js`);
    assert.equal(serviceWorker.status, 200);
    assert.match(await serviceWorker.text(), /fetch/);

    const icon = await fetch(`${base}/icon-192.png`);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');

    const install = await fetch(`${base}/install`);
    assert.equal(install.status, 200);
    assert.match(await install.text(), /Install Rudder/);

    const dashboard = await fetch(`${base}/`);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /Rudder/);

    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => undefined);
    home.restore();
  }
});
