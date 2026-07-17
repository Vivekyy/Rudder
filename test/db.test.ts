import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-db-test-');
});

after(() => {
  home.restore();
});

test('openDb applies generated Drizzle migrations idempotently', async () => {
  const { migrationsFolder, openDb } = await import('../src/db/client.ts');

  assert.ok(migrationsFolder().endsWith('drizzle'));
  const db = openDb();
  assert.equal(openDb(), db, 'openDb should reuse the initialized SQLite handle');

  const tables = new Set(
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((row) => row.name)
  );
  for (const table of [
    '__drizzle_migrations',
    'memory_rules',
    'prompts',
    'rule_evidence',
    'trace_events',
    'trace_verifications',
  ]) {
    assert.ok(tables.has(table), `expected ${table} to be created`);
  }
  assert.ok(!tables.has('prompt_tags'), 'prompt classification storage should be removed');

  const indexes = new Set(
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as { name: string }[]
    ).map((row) => row.name)
  );
  for (const index of [
    'idx_memory_rules_atomic_version',
    'idx_memory_rules_project',
    'idx_memory_rules_status',
    'idx_prompts_day',
    'idx_prompts_source',
    'idx_trace_events_status',
  ]) {
    assert.ok(indexes.has(index), `expected ${index} to be created`);
  }

  const migrations = db
    .prepare('SELECT hash, created_at FROM __drizzle_migrations')
    .all() as { hash: string; created_at: number }[];
  assert.equal(migrations.length, 3);
  assert.ok(migrations[0].hash);
  assert.ok(migrations[0].created_at > 0);
});

test('insertPrompt stores and queries by local day; blanks are skipped', async () => {
  const { insertPrompt, promptsForDay, localDay } = await import('../src/db/index.ts');

  const id = insertPrompt({
    source: 'claude',
    prompt: '  Fix the deploy  ',
    cwd: '/repos/archer',
    project: 'archer',
  });
  assert.ok(id && id > 0);

  // Blank prompts are not recorded.
  assert.equal(insertPrompt({ source: 'codex', prompt: '   ' }), null);

  const rows = promptsForDay(localDay());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, 'Fix the deploy'); // trimmed
  assert.equal(rows[0].source, 'claude');
  assert.equal(rows[0].project, 'archer');

  const explicitDay = '2026-02-03';
  const explicitId = insertPrompt({
    source: 'codex',
    prompt: 'Timed prompt',
    ts: new Date(`${explicitDay}T12:00:00.000Z`),
  });
  assert.ok(explicitId && explicitId > id);
  const explicitRows = promptsForDay(explicitDay);
  assert.equal(explicitRows.length, 1);
  assert.equal(explicitRows[0].prompt, 'Timed prompt');
  assert.equal(explicitRows[0].cwd, null);
});

test('migrationsFolder resolves from source and published layouts', async () => {
  const { migrationsFolder } = await import('../src/db/client.ts');

  const tsUrl = pathToFileURL(join('/repo', 'src', 'db', 'client.ts')).href;
  assert.equal(migrationsFolder(tsUrl), join('/repo', 'drizzle'));

  const jsUrl = pathToFileURL(join('/repo', 'dist', 'src', 'db', 'client.js')).href;
  assert.equal(migrationsFolder(jsUrl), join('/repo', 'drizzle'));
});
