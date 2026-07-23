import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { closeDb } from '../src/db/client.ts';
import {
  promptCaptureDisabled,
  setPromptCaptureEnabled,
} from '../src/prompt-control.ts';
import { recordPromptHookEvent } from '../src/prompt-hook.ts';
import {
  promptsForBranch,
  promptsForSession,
} from '../src/prompt-tagger.ts';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const contextScript = join(
  pluginRoot,
  'skills',
  'rudder',
  'scripts',
  'context.mjs'
);
const backupScript = join(
  pluginRoot,
  'skills',
  'rudder',
  'scripts',
  'backup-tests.mjs'
);
const dataScript = join(
  pluginRoot,
  'skills',
  'rudder',
  'scripts',
  'manage-data.mjs'
);

let root: string;
let repo: string;
let stateRoot: string;
let originalRudderHome: string | undefined;
let originalCaptureDisabled: string | undefined;

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
  }).trim();
}

function runData(...args: string[]): Record<string, unknown> {
  return JSON.parse(
    execFileSync(process.execPath, [dataScript, ...args], {
      encoding: 'utf8',
      env: { ...process.env, RUDDER_HOME: stateRoot },
    })
  ) as Record<string, unknown>;
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-skill-runtime-'));
  repo = join(root, 'repo');
  stateRoot = join(root, 'state');
  mkdirSync(repo);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Rudder Tests');
  git('config', 'user.email', 'tests@rudder.local');
  git('remote', 'add', 'origin', 'git@github.com:rudder-test/skill.git');
  writeFileSync(join(repo, 'fixture.txt'), 'fixture\n');
  git('add', 'fixture.txt');
  git('commit', '-m', 'fixture');

  originalRudderHome = process.env.RUDDER_HOME;
  originalCaptureDisabled = process.env.RUDDER_DISABLE_PROMPT_CAPTURE;
  process.env.RUDDER_HOME = stateRoot;
  delete process.env.RUDDER_DISABLE_PROMPT_CAPTURE;
});

after(() => {
  closeDb();
  if (originalRudderHome === undefined) delete process.env.RUDDER_HOME;
  else process.env.RUDDER_HOME = originalRudderHome;
  if (originalCaptureDisabled === undefined) {
    delete process.env.RUDDER_DISABLE_PROMPT_CAPTURE;
  } else {
    process.env.RUDDER_DISABLE_PROMPT_CAPTURE = originalCaptureDisabled;
  }
  rmSync(root, { recursive: true, force: true });
});

test('capture can be disabled by environment or persistent preference', () => {
  process.env.RUDDER_DISABLE_PROMPT_CAPTURE = '1';
  assert.equal(promptCaptureDisabled(), true);
  assert.equal(
    recordPromptHookEvent('codex', {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'disabled-environment',
      prompt: 'Do not retain this prompt.',
      cwd: repo,
    }),
    null
  );
  delete process.env.RUDDER_DISABLE_PROMPT_CAPTURE;

  setPromptCaptureEnabled(false);
  assert.equal(promptCaptureDisabled(), true);
  assert.equal(
    recordPromptHookEvent('claude-code', {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'disabled-preference',
      prompt: 'Do not retain this prompt either.',
      cwd: repo,
    }),
    null
  );
  assert.deepEqual(promptsForSession('codex', 'disabled-environment'), []);
  assert.deepEqual(promptsForSession('claude-code', 'disabled-preference'), []);

  setPromptCaptureEnabled(true);
  assert.equal(promptCaptureDisabled(), false);
});

test('the skill helper returns branch changes and locally captured intent', () => {
  recordPromptHookEvent('codex', {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'skill-context',
    turn_id: 'skill-turn',
    prompt: 'Return cached data when the request times out.',
    cwd: repo,
  });
  mkdirSync(join(repo, 'src'));
  mkdirSync(join(repo, 'test'));
  writeFileSync(join(repo, 'src', 'feature.ts'), 'export const feature = true;\n');
  writeFileSync(join(repo, 'test', 'feature.test.ts'), '/* pending */\n');

  closeDb();
  const context = JSON.parse(
    execFileSync(
      process.execPath,
      [contextScript, '--cwd', repo, '--base', 'HEAD'],
      {
        encoding: 'utf8',
        env: { ...process.env, RUDDER_HOME: stateRoot },
      }
    )
  ) as {
    branch: string;
    otherPaths: string[];
    testPaths: string[];
    prompts: Array<{ promptText: string }>;
  };

  assert.equal(context.branch, 'main');
  assert.deepEqual(context.testPaths, ['test/feature.test.ts']);
  assert.ok(context.otherPaths.includes('src/feature.ts'));
  assert.equal(
    context.prompts[0]?.promptText,
    'Return cached data when the request times out.'
  );
});

test('the skill helper backs up only explicit test paths', () => {
  const backup = JSON.parse(
    execFileSync(
      process.execPath,
      [
        backupScript,
        '--cwd',
        repo,
        '--base',
        'HEAD',
        '--path',
        'test/feature.test.ts',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RUDDER_HOME: stateRoot },
      }
    )
  ) as {
    patchPath: string;
    metadataPath: string;
    copiedUntrackedPaths: string[];
  };

  assert.ok(existsSync(backup.patchPath));
  assert.ok(existsSync(backup.metadataPath));
  assert.deepEqual(backup.copiedUntrackedPaths, ['test/feature.test.ts']);
  assert.equal(
    readFileSync(
      join(
        backup.metadataPath,
        '..',
        'untracked',
        'test',
        'feature.test.ts'
      ),
      'utf8'
    ),
    '/* pending */\n'
  );
});

test('data controls require confirmation and delete only prompt records', () => {
  assert.equal(runData('status').promptCount, 1);

  const unconfirmed = spawnSync(
    process.execPath,
    [dataScript, 'delete'],
    {
      encoding: 'utf8',
      env: { ...process.env, RUDDER_HOME: stateRoot },
    }
  );
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /requires --confirm/);
  assert.equal(runData('status').promptCount, 1);

  const deleted = runData('delete', '--confirm');
  assert.equal(deleted.deletedPromptCount, 1);
  assert.equal(deleted.promptCount, 0);
  assert.deepEqual(
    promptsForBranch('github.com/rudder-test/skill', 'main'),
    []
  );

  assert.equal(runData('disable').captureEnabled, false);
  assert.equal(runData('enable').captureEnabled, true);
});
