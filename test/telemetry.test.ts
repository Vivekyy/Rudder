import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-telemetry-test-');
});

after(() => {
  home.restore();
});

test('telemetryDisabled honors DO_NOT_TRACK=1 opt-out', async () => {
  const { telemetryDisabled } = await import('../src/telemetry.ts');

  assert.equal(telemetryDisabled({}), false);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: '1' }), true);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: 'yes' }), false);
  assert.equal(telemetryDisabled({ DO_NOT_TRACK: '0' }), false);
});

test('distinctId is generated once and persisted for no-key capture calls', async () => {
  const { distinctId, capture, captureException, shutdown } = await import('../src/telemetry.ts');

  const id = distinctId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(distinctId(), id);

  const identityPath = join(home.path, 'identity.json');
  assert.ok(existsSync(identityPath));
  assert.deepEqual(JSON.parse(readFileSync(identityPath, 'utf8')), { id });

  capture('test event', { ok: true });
  captureException(new Error('boom'), { handled: true });
  await shutdown();
});
