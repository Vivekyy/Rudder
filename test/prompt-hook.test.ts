import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { closeDb } from '../src/db/client.ts';
import {
  normalizePromptHookPayload,
  recordPromptHookEvent,
} from '../src/prompt-hook.ts';
import { promptsForSession } from '../src/prompt-tagger.ts';

let root: string;
let repo: string;
let originalRudderHome: string | undefined;

const hookExecutable = fileURLToPath(new URL('../bin/rudder-prompt-hook.ts', import.meta.url));

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-prompt-hook-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Rudder Tests');
  git(repo, 'config', 'user.email', 'tests@rudder.local');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:rudder-test/hooks.git');
  writeFileSync(join(repo, 'fixture.txt'), 'fixture\n');
  git(repo, 'add', 'fixture.txt');
  git(repo, 'commit', '-m', 'fixture');

  originalRudderHome = process.env.RUDDER_HOME;
  process.env.RUDDER_HOME = join(root, 'state');
});

after(() => {
  closeDb();
  if (originalRudderHome === undefined) delete process.env.RUDDER_HOME;
  else process.env.RUDDER_HOME = originalRudderHome;
  rmSync(root, { recursive: true, force: true });
});

test('normalizes the prompt key used by each supported agent', () => {
  const fixtures = [
    ['claude-code', 'prompt_id', 'UserPromptSubmit', 'claude-prompt'],
    ['codex', 'turn_id', 'UserPromptSubmit', 'codex-turn'],
    ['cursor', 'generation_id', 'beforeSubmitPrompt', 'cursor-generation'],
  ] as const;

  for (const [source, idField, hookEvent, id] of fixtures) {
    assert.equal(
      normalizePromptHookPayload(source, {
        hook_event_name: hookEvent,
        session_id: `${source}-session`,
        [idField]: id,
        prompt: `Prompt from ${source}`,
        cwd: repo,
      }).promptId,
      id
    );
  }
});

test('stores a prompt on submit and reconciles it on stop', () => {
  recordPromptHookEvent('cursor', {
    hook_event_name: 'beforeSubmitPrompt',
    conversation_id: 'cursor-session',
    generation_id: 'cursor-generation',
    prompt: 'Create and switch to a feature branch.',
    workspace_roots: [repo],
    transcript_path: join(root, 'cursor.jsonl'),
  });

  git(repo, 'switch', '-c', 'feature/cursor-prompt');

  const row = recordPromptHookEvent('cursor', {
    hook_event_name: 'stop',
    conversation_id: 'cursor-session',
    generation_id: 'cursor-generation',
    workspace_roots: [repo],
    transcript_path: join(root, 'cursor.jsonl'),
  });

  assert.equal(row?.promptText, 'Create and switch to a feature branch.');
  assert.equal(row?.branch, 'feature/cursor-prompt');
  assert.ok(row?.reconciledAt);
});

test('the executable performs both phases without model-visible output', () => {
  closeDb();
  const env = { ...process.env, RUDDER_HOME: process.env.RUDDER_HOME };
  const stdout = execFileSync(
    process.execPath,
    [hookExecutable, '--source', 'codex'],
    {
      cwd: repo,
      encoding: 'utf8',
      env,
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'codex-session',
        turn_id: 'codex-turn',
        prompt: 'Switch to the CLI branch.',
        cwd: repo,
      }),
    }
  );
  assert.equal(stdout, '');

  git(repo, 'switch', '-c', 'feature/cli-prompt');
  execFileSync(process.execPath, [hookExecutable, '--source', 'codex'], {
    cwd: repo,
    encoding: 'utf8',
    env,
    input: JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'codex-session',
      turn_id: 'codex-turn',
      cwd: repo,
    }),
  });

  assert.equal(promptsForSession('codex', 'codex-session')[0]?.branch, 'feature/cli-prompt');
});

test('the executable ignores unavailable Git context', () => {
  closeDb();
  const result = spawnSync(process.execPath, [hookExecutable, '--source', 'claude-code'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, RUDDER_HOME: process.env.RUDDER_HOME },
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'outside-git-session',
      prompt: 'Draft a note.',
      cwd: root,
    }),
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(promptsForSession('claude-code', 'outside-git-session'), []);
});
