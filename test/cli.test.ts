import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpDir, makeStubBin, withFakeStdin, runMain } from './helpers.ts';

let home: string;
let db: typeof import('../src/db.ts');
let cli: typeof import('../src/cli.ts');
const origHome = process.env.HOME;

before(async () => {
  home = tmpDir();
  process.env.RUDDER_HOME = home;
  db = await import('../src/db.ts');
  cli = await import('../src/cli.ts');
});

after(() => {
  rmSync(home, { recursive: true, force: true });
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
});

beforeEach(() => {
  db.openDb().exec('DELETE FROM prompts;');
  delete process.env.RUDDER_DISABLE;
});

// ---- help / dispatch --------------------------------------------------------

for (const arg of ['help', '--help', '-h']) {
  test(`'${arg}' prints usage to stdout without exiting non-zero`, async () => {
    const { stdout, exitCode } = await runMain(cli.main, [arg]);
    assert.match(stdout, /^rudder — record your AI coding prompts/);
    assert.equal(exitCode, null);
  });
}

test('no command prints usage', async () => {
  const { stdout, exitCode } = await runMain(cli.main, []);
  assert.match(stdout, /Usage:/);
  assert.equal(exitCode, null);
});

test('an unknown command errors with usage and exit code 1', async () => {
  const { stderr, exitCode } = await runMain(cli.main, ['frobnicate']);
  assert.match(stderr, /unknown command 'frobnicate'/);
  assert.match(stderr, /Usage:/);
  assert.equal(exitCode, 1);
});

// ---- hook subcommand --------------------------------------------------------

test("'hook' without claude/codex warns and exits 0", async () => {
  const { stderr, exitCode } = await runMain(cli.main, ['hook']);
  assert.match(stderr, /hook requires 'claude' or 'codex'/);
  assert.equal(exitCode, 0);
});

test("'hook claude' records the stdin prompt and exits 0", async () => {
  const payload = JSON.stringify({ cwd: '/repos/cliproj', prompt: 'via cli hook' });
  const { exitCode } = await withFakeStdin(payload, () => runMain(cli.main, ['hook', 'claude']));
  assert.equal(exitCode, 0);

  const rows = db.promptsForDay(db.localDay());
  const found = rows.find((r) => r.prompt === 'via cli hook');
  assert.ok(found, 'the claude hook should have recorded the prompt');
  assert.equal(found!.project, 'cliproj');
});

test("'hook codex' records the notify payload and exits 0", async () => {
  const arg = JSON.stringify({
    type: 'agent-turn-complete',
    'input-messages': ['via cli codex hook'],
    cwd: '/repos/cdx',
  });
  const { exitCode } = await runMain(cli.main, ['hook', 'codex', arg]);
  assert.equal(exitCode, 0);

  const found = db.promptsForDay(db.localDay()).find((r) => r.source === 'codex');
  assert.ok(found);
  assert.equal(found!.prompt, 'via cli codex hook');
});

// ---- digest subcommand ------------------------------------------------------

test('digest with an invalid --agent exits 1', async () => {
  const { stderr, exitCode } = await runMain(cli.main, ['digest', '--agent', 'bard']);
  assert.match(stderr, /--agent must be 'claude' or 'codex'/);
  assert.equal(exitCode, 1);
});

test('digest with no prompts for the day exits 1 with a clear message', async () => {
  const { stderr, exitCode } = await runMain(cli.main, ['digest', '--date', '1999-01-01']);
  assert.match(stderr, /rudder: No prompts recorded for 1999-01-01/);
  assert.equal(exitCode, 1);
});

test('digest writes the output file and returns cleanly with a stub agent', async () => {
  db.insertPrompt({ source: 'claude', prompt: 'real work', project: 'p' });
  const day = db.localDay();
  const bin = tmpDir('rudder-bin-');
  makeStubBin(bin, 'claude', { out: 'CLI DIGEST' });
  const out = join(tmpDir('rudder-out-'), 'digest.md');

  const origPath = process.env.PATH;
  process.env.PATH = bin;
  let exitCode: number | null;
  try {
    ({ exitCode } = await runMain(cli.main, ['digest', '--date', day, '--out', out]));
  } finally {
    process.env.PATH = origPath;
  }

  assert.equal(exitCode, null, 'a successful digest does not call process.exit');
  assert.ok(readFileSync(out, 'utf8').includes('CLI DIGEST'));
});

// ---- init subcommand --------------------------------------------------------

test("'init' creates the db and installs both hooks under HOME", async () => {
  const fakeHome = tmpDir('rudder-inithome-');
  const origP = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    const { exitCode } = await runMain(cli.main, ['init']);
    assert.equal(exitCode, null);
    assert.ok(existsSync(join(fakeHome, '.claude', 'settings.json')), 'claude hook installed');
    assert.ok(existsSync(join(fakeHome, '.codex', 'config.toml')), 'codex hook installed');
  } finally {
    process.env.HOME = origP;
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
