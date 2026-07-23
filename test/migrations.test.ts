import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { closeDb, openDb } from '../src/db/client.ts';

let root: string;
let originalRudderHome: string | undefined;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-migrations-'));
  originalRudderHome = process.env.RUDDER_HOME;
  process.env.RUDDER_HOME = join(root, 'state');
});

after(() => {
  closeDb();
  if (originalRudderHome === undefined) delete process.env.RUDDER_HOME;
  else process.env.RUDDER_HOME = originalRudderHome;
  rmSync(root, { recursive: true, force: true });
});

test('applies generated Drizzle migrations to a new database', () => {
  const db = openDb();
  const tableNames = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('prompt_branches', 'session_branches') ORDER BY name"
    )
    .all()
    .map((row) => (row as { name: string }).name);

  assert.deepEqual(tableNames, ['prompt_branches']);
  assert.deepEqual(
    db
      .prepare('PRAGMA table_info(prompt_branches)')
      .all()
      .filter((row) => (row as { name: string }).name === 'previous_agent_output')
      .map((row) => ({
        name: (row as { name: string }).name,
        notnull: (row as { notnull: number }).notnull,
      })),
    [{ name: 'previous_agent_output', notnull: 0 }]
  );
  assert.equal(
    (
      db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get() as { count: number }
    ).count,
    3
  );
});
