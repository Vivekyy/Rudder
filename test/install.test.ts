import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { useTempHome, type TempHome } from './helpers.ts';

let home: TempHome;

before(() => {
  home = useTempHome('rudder-install-test-');
});

after(() => {
  home.restore();
});

test('rudderArgv points at a bin file that actually exists', async () => {
  const { rudderArgv } = await import('../src/install.ts');

  const argv = rudderArgv(['hook', 'claude']);
  assert.equal(argv[0], process.execPath);
  assert.equal(argv[2], 'hook');
  assert.equal(argv[3], 'claude');
  // This test runs from the `.ts` source tree, so it only guards the dev path:
  // the bin must resolve to a real file on disk. The published `.js` build is
  // covered separately below, since it can't be exercised without a build.
  assert.ok(existsSync(argv[1]), `rudder bin should exist at ${argv[1]}`);
});

test('rudderBinPath matches the bin extension to the loading module', async () => {
  const { rudderBinPath } = await import('../src/install.ts');

  // Dev `.ts` checkout: src/install.ts <-> bin/rudder.ts.
  const tsUrl = pathToFileURL(join('/repo', 'src', 'install.ts')).href;
  assert.equal(rudderBinPath(tsUrl), join('/repo', 'bin', 'rudder.ts'));

  // Published `.js` build: dist/src/install.js <-> dist/bin/rudder.js - the path
  // that had the original "hook points at a nonexistent file" bug.
  const jsUrl = pathToFileURL(join('/repo', 'dist', 'src', 'install.js')).href;
  assert.equal(rudderBinPath(jsUrl), join('/repo', 'dist', 'bin', 'rudder.js'));
});

test('init creates the database, installs hooks, and backs up existing config', async () => {
  const claudeDir = join(home.path, '.claude');
  const codexDir = join(home.path, '.codex');
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(codexDir, { recursive: true });
  const claudeSettings = join(claudeDir, 'settings.json');
  const codexHooks = join(codexDir, 'hooks.json');
  const codexConfig = join(codexDir, 'config.toml');
  writeFileSync(claudeSettings, JSON.stringify({ hooks: {} }));
  writeFileSync(codexHooks, JSON.stringify({ hooks: {} }));
  writeFileSync(codexConfig, 'notify = ["node", "rudder", "hook"]\nmodel = "gpt"\n');

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(' '));
  };
  try {
    const { init } = await import('../src/install.ts');
    init();
  } finally {
    console.log = originalLog;
  }

  assert.ok(existsSync(join(home.path, 'rudder.db')));
  assert.ok(existsSync(`${claudeSettings}.rudder-bak`));
  assert.ok(existsSync(`${codexHooks}.rudder-bak`));
  assert.ok(existsSync(`${codexConfig}.rudder-bak`));

  const updatedClaude = JSON.parse(readFileSync(claudeSettings, 'utf8')) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string; timeout: number }> }>>;
  };
  assert.equal(updatedClaude.hooks.UserPromptSubmit.length, 1);
  assert.equal(updatedClaude.hooks.Stop.length, 1);
  assert.match(updatedClaude.hooks.UserPromptSubmit[0].hooks[0].command, /rudder\.ts/);

  const updatedCodex = JSON.parse(readFileSync(codexHooks, 'utf8')) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string; timeout: number }> }>>;
  };
  assert.equal(updatedCodex.hooks.UserPromptSubmit.length, 1);
  assert.equal(updatedCodex.hooks.Stop.length, 1);
  assert.doesNotMatch(readFileSync(codexConfig, 'utf8'), /notify\s*=/);
  assert.match(logs.join('\n'), /database ready/);
});
