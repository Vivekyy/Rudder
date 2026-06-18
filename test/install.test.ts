import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpDir } from './helpers.ts';

let root: string; // serves as both HOME and RUDDER_HOME
let install: typeof import('../src/install.ts');
const origHome = process.env.HOME;
const origLog = console.log;

before(async () => {
  // Point RUDDER_HOME somewhere stable before the db module loads via install.
  process.env.RUDDER_HOME = join(tmpDir(), '.rudder');
  install = await import('../src/install.ts');
});

after(() => {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  console.log = origLog;
});

// Fresh fake HOME per test so settings/config files never collide, and silence
// init()'s console output to keep the test log readable.
beforeEach(() => {
  root = tmpDir('rudder-home-');
  process.env.HOME = root;
  console.log = () => {};
});

afterEach(() => {
  console.log = origLog;
  rmSync(root, { recursive: true, force: true });
});

const claudeSettings = () => join(root, '.claude', 'settings.json');
const codexConfig = () => join(root, '.codex', 'config.toml');

// ---- pure path helpers ------------------------------------------------------

test('rudderBinPath matches the bin extension to the loading module', () => {
  const tsUrl = pathToFileURL(join('/repo', 'src', 'install.ts')).href;
  assert.equal(install.rudderBinPath(tsUrl), join('/repo', 'bin', 'rudder.ts'));

  const jsUrl = pathToFileURL(join('/repo', 'dist', 'src', 'install.js')).href;
  assert.equal(install.rudderBinPath(jsUrl), join('/repo', 'dist', 'bin', 'rudder.js'));
});

test('rudderArgv uses the current node binary and points at an existing bin', () => {
  const argv = install.rudderArgv(['hook', 'claude']);
  assert.equal(argv[0], process.execPath);
  assert.equal(argv[2], 'hook');
  assert.equal(argv[3], 'claude');
  // In the dev .ts checkout the resolved bin must exist on disk.
  assert.ok(existsSync(argv[1]), `rudder bin should exist at ${argv[1]}`);
});

// ---- init / Claude hook -----------------------------------------------------

test('init installs the Claude UserPromptSubmit hook pointing at the rudder bin', () => {
  install.init();

  const settings = JSON.parse(readFileSync(claudeSettings(), 'utf8'));
  const entries = settings.hooks.UserPromptSubmit;
  assert.equal(entries.length, 1);
  const command = entries[0].hooks[0].command;
  assert.equal(entries[0].hooks[0].type, 'command');
  assert.ok(command.includes('hook'), 'command should invoke the rudder hook');
  assert.ok(command.includes('claude'), 'command should pass the claude subcommand');
});

test('init is idempotent for the Claude hook and backs up an existing file', () => {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(claudeSettings(), JSON.stringify({ existing: true }) + '\n');

  install.init();
  install.init(); // second run must not append a duplicate

  const settings = JSON.parse(readFileSync(claudeSettings(), 'utf8'));
  assert.equal(settings.existing, true, 'pre-existing keys are preserved');
  assert.equal(settings.hooks.UserPromptSubmit.length, 1, 'hook is not duplicated');
  assert.ok(existsSync(`${claudeSettings()}.rudder-bak`), 'a backup of the original is written');
});

test('init throws a clear error when ~/.claude/settings.json is invalid JSON', () => {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(claudeSettings(), '{ this is not json');

  assert.throws(() => install.init(), /Could not parse .*settings\.json as JSON/);
});

// ---- init / Codex notify ----------------------------------------------------

test('init writes a top-level Codex notify array into a fresh config.toml', () => {
  install.init();

  const toml = readFileSync(codexConfig(), 'utf8');
  assert.match(toml, /^notify = \[/m);
  assert.ok(toml.includes('"hook"') && toml.includes('"codex"'));
});

test('init prepends notify above existing tables to keep the TOML valid', () => {
  mkdirSync(join(root, '.codex'), { recursive: true });
  writeFileSync(codexConfig(), '[model]\nname = "gpt"\n');

  install.init();

  const toml = readFileSync(codexConfig(), 'utf8');
  // notify must come before the [model] table.
  assert.ok(toml.indexOf('notify =') < toml.indexOf('[model]'));
  assert.ok(toml.includes('name = "gpt"'), 'existing config is preserved');
  assert.ok(existsSync(`${codexConfig()}.rudder-bak`), 'original config is backed up');
});

test('init replaces a pre-existing notify line rather than adding a second', () => {
  mkdirSync(join(root, '.codex'), { recursive: true });
  writeFileSync(codexConfig(), 'notify = ["old", "notifier"]\n[model]\nname = "x"\n');

  install.init();

  const toml = readFileSync(codexConfig(), 'utf8');
  assert.equal((toml.match(/^notify = /gm) || []).length, 1, 'exactly one notify line');
  assert.ok(!toml.includes('"old"'), 'the old notifier is replaced');
  assert.ok(toml.includes('"codex"'), 'the rudder hook is installed');
});

test('init leaves an already-present rudder Codex notify untouched', () => {
  install.init();
  const first = readFileSync(codexConfig(), 'utf8');
  install.init();
  const second = readFileSync(codexConfig(), 'utf8');
  assert.equal(first, second, 'a second init does not rewrite the config');
});
