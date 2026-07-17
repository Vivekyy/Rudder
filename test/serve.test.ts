import { once } from 'node:events';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
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
  execFileSync('npm', ['run', 'frontend:build'], { cwd: process.cwd(), stdio: 'ignore' });
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
    assert.deepEqual(await rules.json(), { active_rules: [], pending_prompts: 0, pending_rules: [] });

    const created = await fetch(`${base}/api/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ruleText: 'Keep manual rules editable.',
        appliesWhen: 'working in the dashboard',
        doesNotApplyWhen: 'rules are learned automatically',
        enforced: false,
      }),
    });
    assert.equal(created.status, 201);
    const createState = await created.json();
    assert.equal(createState.active_rules.length, 1);
    const firstRule = createState.active_rules[0];
    assert.match(firstRule.atomic_id, /^rule_/);
    assert.equal(firstRule.version, 1);
    assert.equal(firstRule.enforced, false);

    const toggled = await fetch(`${base}/api/rules/${firstRule.id}/enforced`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enforced: true }),
    });
    assert.equal(toggled.status, 200);
    const toggleState = await toggled.json();
    assert.equal(toggleState.active_rules.length, 1);
    const toggledRule = toggleState.active_rules[0];
    assert.equal(toggledRule.atomic_id, firstRule.atomic_id);
    assert.equal(toggledRule.version, 1);
    assert.equal(toggledRule.enforced, true);

    const edited = await fetch(`${base}/api/rules/${toggledRule.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ruleText: 'Keep manual rules editable and reviewable.',
        appliesWhen: 'working in the dashboard',
        doesNotApplyWhen: 'rules are learned automatically',
        enforced: true,
      }),
    });
    assert.equal(edited.status, 200);
    const editState = await edited.json();
    const editedRule = editState.active_rules[0];
    assert.equal(editedRule.atomic_id, firstRule.atomic_id);
    assert.equal(editedRule.version, 2);
    assert.equal(editedRule.rule_text, 'Keep manual rules editable and reviewable.');

    const deleted = await fetch(`${base}/api/rules/${editedRule.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.deepEqual((await deleted.json()).active_rules, []);

    const notify = await fetch(`${base}/notify`, { method: 'POST' });
    assert.equal(notify.status, 204);

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(await manifest.text(), /rudder/);

    const serviceWorker = await fetch(`${base}/sw.js`);
    assert.equal(serviceWorker.status, 200);
    assert.match(await serviceWorker.text(), /fetch/);

    const svgIcon = await fetch(`${base}/icon.svg`);
    assert.equal(svgIcon.status, 200);
    assert.equal(svgIcon.headers.get('content-type'), 'image/svg+xml');
    assert.match(await svgIcon.text(), /M43 65H168/);

    const pngIcon = await fetch(`${base}/icon-192.png`);
    assert.equal(pngIcon.status, 200);
    assert.equal(pngIcon.headers.get('content-type'), 'image/png');

    const install = await fetch(`${base}/install`);
    assert.equal(install.status, 200);
    assert.match(await install.text(), /<div id="root"><\/div>/);

    const dashboard = await fetch(`${base}/`);
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /<title>rudder<\/title>/);
    assert.match(dashboardHtml, /\/assets\/.+\.js/);

    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 200);
    assert.match(await missing.text(), /<div id="root"><\/div>/);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => undefined);
    home.restore();
  }
});
