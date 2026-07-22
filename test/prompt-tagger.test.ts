import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { closeDb } from '../src/db/client.ts';
import { normalizeRepository, resolveBranchContext } from '../src/git-context.ts';
import {
  promptsForBranch,
  promptsForSession,
  reconcilePromptBranch,
  recordPromptBranch,
} from '../src/prompt-tagger.ts';

let root: string;
let repo: string;
let originalRudderHome: string | undefined;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-prompt-tagger-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Rudder Tests');
  git(repo, 'config', 'user.email', 'tests@rudder.local');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:rudder-test/example.git');
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

test('normalizes common remote forms to the same repository key', () => {
  assert.equal(
    normalizeRepository('git@github.com:rudder-test/example.git'),
    'github.com/rudder-test/example'
  );
  assert.equal(
    normalizeRepository('https://github.com/rudder-test/example.git'),
    'github.com/rudder-test/example'
  );
  assert.equal(
    normalizeRepository('ssh://git@github.com/rudder-test/example.git'),
    'github.com/rudder-test/example'
  );
});

test('resolves the repository and branch from nested directories', () => {
  const nested = join(repo, 'packages', 'api');
  mkdirSync(nested, { recursive: true });

  assert.deepEqual(resolveBranchContext(nested), {
    repository: 'github.com/rudder-test/example',
    branch: 'main',
  });
});

test('stores actual prompt text on the branch where it was submitted', () => {
  const row = recordPromptBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    promptId: 'prompt-1',
    promptText: 'Add a session list.',
    cwd: repo,
    submittedAt: '2026-07-22T10:00:00.000Z',
  });

  assert.deepEqual(row, {
    source: 'claude-code',
    sessionId: 'session-1',
    promptId: 'prompt-1',
    promptText: 'Add a session list.',
    repository: 'github.com/rudder-test/example',
    branch: 'main',
    submittedAt: '2026-07-22T10:00:00.000Z',
    reconciledAt: null,
  });
});

test('moves the prompt link when its turn changes branches', () => {
  git(repo, 'switch', '-c', 'feature/from-prompt');
  const row = reconcilePromptBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    promptId: 'prompt-1',
    cwd: repo,
    reconciledAt: '2026-07-22T10:05:00.000Z',
  });

  assert.equal(row?.branch, 'feature/from-prompt');
  assert.equal(row?.reconciledAt, '2026-07-22T10:05:00.000Z');
  assert.deepEqual(promptsForBranch('github.com/rudder-test/example', 'main'), []);
  assert.equal(
    promptsForBranch(
      'https://github.com/rudder-test/example.git',
      'refs/heads/feature/from-prompt'
    )[0]?.promptText,
    'Add a session list.'
  );

  git(repo, 'switch', 'main');
  const replayed = recordPromptBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    promptId: 'prompt-1',
    promptText: 'Add a session list.',
    cwd: repo,
    submittedAt: '2026-07-22T10:00:00.000Z',
  });
  assert.equal(replayed.branch, 'feature/from-prompt');
  git(repo, 'switch', 'feature/from-prompt');
});

test('falls back to the latest unreconciled session prompt without a provider prompt ID', () => {
  recordPromptBranch({
    source: 'claude-code',
    sessionId: 'legacy-session',
    promptText: 'Create another branch.',
    cwd: repo,
    submittedAt: '2026-07-22T11:00:00.000Z',
  });

  const row = reconcilePromptBranch({
    source: 'claude-code',
    sessionId: 'legacy-session',
    cwd: repo,
    reconciledAt: '2026-07-22T11:05:00.000Z',
  });

  assert.equal(row?.promptText, 'Create another branch.');
  assert.equal(row?.branch, 'feature/from-prompt');
  assert.equal(promptsForSession('claude-code', 'legacy-session').length, 1);
});
