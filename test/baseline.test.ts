import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const originalRudderHome = process.env.RUDDER_HOME;
const originalPosthogApiKey = process.env.POSTHOG_API_KEY;

function useTempRudderHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rudder-test-'));
  process.env.RUDDER_HOME = dir;
  return dir;
}

function restoreEnv(): void {
  if (originalRudderHome === undefined) {
    delete process.env.RUDDER_HOME;
  } else {
    process.env.RUDDER_HOME = originalRudderHome;
  }

  if (originalPosthogApiKey === undefined) {
    delete process.env.POSTHOG_API_KEY;
  } else {
    process.env.POSTHOG_API_KEY = originalPosthogApiKey;
  }
}

test('base database stores trimmed prompt rows', async () => {
  const dir = useTempRudderHome();
  const { openDb } = await import('../src/db/client.ts');
  const { insertPrompt, localDay, promptsForDay } = await import('../src/db/prompts.ts');
  const db = openDb();

  try {
    const ts = new Date(2026, 6, 21, 9, 30, 0);
    const day = localDay(ts);

    assert.equal(
      insertPrompt({
        source: 'codex',
        prompt: '  keep this prompt  ',
        session_id: 'session-1',
        cwd: '/workspace',
        project: 'rudder',
        model: 'gpt-test',
        raw: '{"prompt":"keep this prompt"}',
        ts,
      }),
      1
    );
    assert.equal(insertPrompt({ source: 'claude', prompt: '   ' }), null);

    const rows = promptsForDay(day);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'codex');
    assert.equal(rows[0].prompt, 'keep this prompt');
    assert.equal(rows[0].session_id, 'session-1');
    assert.equal(rows[0].project, 'rudder');
    assert.equal(rows[0].model, 'gpt-test');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    restoreEnv();
  }
});

test('telemetry is best-effort and persists an anonymous identity', async () => {
  const dir = useTempRudderHome();
  delete process.env.POSTHOG_API_KEY;
  const { capture, captureException, distinctId, shutdown, telemetryDisabled } = await import(
    '../src/telemetry.ts'
  );

  try {
    assert.equal(telemetryDisabled({ DO_NOT_TRACK: '1' }), true);
    assert.equal(telemetryDisabled({}), false);

    const id = distinctId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(JSON.parse(readFileSync(join(dir, 'identity.json'), 'utf8')).id, id);

    capture('baseline_test_event');
    captureException(new Error('baseline test error'));
    await shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    restoreEnv();
  }
});
