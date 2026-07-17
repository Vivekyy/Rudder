import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

test('distinctId reuses valid stored identity files', async () => {
  const storedHome = useTempHome('rudder-telemetry-stored-test-');
  try {
    const id = '11111111-1111-4111-8111-111111111111';
    mkdirSync(storedHome.path, { recursive: true });
    writeFileSync(join(storedHome.path, 'identity.json'), JSON.stringify({ id }));

    const telemetry = await import(`../src/telemetry.ts?stored=${Date.now()}`);
    assert.equal(telemetry.distinctId(), id);
  } finally {
    storedHome.restore();
  }
});

test('distinctId replaces malformed identity files', async () => {
  const malformedHome = useTempHome('rudder-telemetry-malformed-test-');
  try {
    writeFileSync(join(malformedHome.path, 'identity.json'), '{malformed');

    const telemetry = await import(`../src/telemetry.ts?malformed=${Date.now()}`);
    assert.match(telemetry.distinctId(), /^[0-9a-f-]{36}$/);
  } finally {
    malformedHome.restore();
  }
});
