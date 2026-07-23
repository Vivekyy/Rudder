import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { closeDb } from '../src/db/client.ts';
import { promptsForSession } from '../src/prompt-tagger.ts';

const pluginRoot = fileURLToPath(new URL('../plugins/rudder/', import.meta.url));
const pluginHook = join(pluginRoot, 'dist', 'rudder-prompt-hook.mjs');

let root: string;
let repo: string;
let originalRudderHome: string | undefined;

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-plugin-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Rudder Tests');
  git('config', 'user.email', 'tests@rudder.local');
  git('remote', 'add', 'origin', 'git@github.com:rudder-test/plugin.git');
  writeFileSync(join(repo, 'fixture.txt'), 'fixture\n');
  git('add', 'fixture.txt');
  git('commit', '-m', 'fixture');
  originalRudderHome = process.env.RUDDER_HOME;
  process.env.RUDDER_HOME = join(root, 'state');
});

after(() => {
  closeDb();
  if (originalRudderHome === undefined) delete process.env.RUDDER_HOME;
  else process.env.RUDDER_HOME = originalRudderHome;
  rmSync(root, { recursive: true, force: true });
});

test('ships matching Codex and Claude plugin metadata', () => {
  const codex = JSON.parse(
    readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')
  );
  const claude = JSON.parse(
    readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const packageManifest = JSON.parse(
    readFileSync(join(pluginRoot, 'package.json'), 'utf8')
  );

  assert.equal(codex.name, 'rudder');
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
  assert.equal(codex.description, claude.description);
  assert.equal(packageManifest.dependencies, undefined);
  assert.ok(packageManifest.files.includes('dist'));
});

test('registers prompt submission and stop hooks from the plugin root', () => {
  const config = JSON.parse(
    readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')
  );

  for (const event of ['UserPromptSubmit', 'Stop']) {
    assert.equal(config.hooks[event].length, 1);
    assert.equal(config.hooks[event][0].hooks[0].type, 'command');
    assert.match(config.hooks[event][0].hooks[0].command, /CLAUDE_PLUGIN_ROOT/);
    assert.match(config.hooks[event][0].hooks[0].command, /dist\/rudder-prompt-hook/);
  }
});

test('maps plugin hosts to Rudder prompt sources without visible output', () => {
  closeDb();

  const fixtures = [
    {
      source: 'codex',
      sessionId: 'plugin-codex-session',
      environment: {
        PLUGIN_ROOT: pluginRoot,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
      },
    },
    {
      source: 'claude-code',
      sessionId: 'plugin-claude-session',
      environment: {
        CLAUDE_PLUGIN_ROOT: pluginRoot,
      },
    },
  ] as const;

  for (const fixture of fixtures) {
    const stdout = execFileSync(process.execPath, [pluginHook], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...fixture.environment,
        RUDDER_HOME: process.env.RUDDER_HOME,
      },
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: fixture.sessionId,
        prompt: `Prompt from the ${fixture.source} plugin.`,
        cwd: repo,
      }),
    });

    assert.equal(stdout, '');

    const stopStdout = execFileSync(process.execPath, [pluginHook], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...fixture.environment,
        RUDDER_HOME: process.env.RUDDER_HOME,
      },
      input: JSON.stringify({
        hook_event_name: 'Stop',
        session_id: fixture.sessionId,
        cwd: repo,
      }),
    });

    const row = promptsForSession(fixture.source, fixture.sessionId)[0];
    assert.equal(stopStdout, '');
    assert.equal(row?.promptText, `Prompt from the ${fixture.source} plugin.`);
    assert.ok(row?.reconciledAt);
  }
});
