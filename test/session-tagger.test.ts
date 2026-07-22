import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { closeDb } from '../src/db/client.ts';
import {
  branchesForSession,
  normalizeRepository,
  recordSessionBranch,
  resolveBranchContext,
  sessionsForBranch,
  tryRecordSessionBranch,
} from '../src/session-tagger.ts';

let root: string;
let repo: string;
let originalRudderHome: string | undefined;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rudder-session-tagger-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Rudder Tests');
  git(repo, 'config', 'user.email', 'tests@rudder.local');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:rudder-test/example.git');
  writeFileSync(join(repo, 'fixture.txt'), 'fixture\n');
  git(repo, 'add', 'fixture.txt');
  git(repo, 'commit', '-m', 'fixture');
  git(repo, 'switch', '-c', 'feature/session-list');

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
    branch: 'feature/session-list',
  });
});

test('records one timestamped row per session and repository branch', () => {
  recordSessionBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    cwd: repo,
    observedAt: '2026-07-22T10:00:00.000Z',
  });
  recordSessionBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    cwd: repo,
    observedAt: '2026-07-22T11:00:00.000Z',
  });
  recordSessionBranch({
    source: 'claude-code',
    sessionId: 'session-1',
    cwd: repo,
    observedAt: '2026-07-22T09:00:00.000Z',
  });

  assert.deepEqual(branchesForSession('claude-code', 'session-1'), [
    {
      source: 'claude-code',
      sessionId: 'session-1',
      repository: 'github.com/rudder-test/example',
      branch: 'feature/session-list',
      observedAt: '2026-07-22T09:00:00.000Z',
    },
  ]);
});

test('returns every session associated with a repository branch', () => {
  recordSessionBranch({
    source: 'codex',
    sessionId: 'session-2',
    cwd: repo,
    observedAt: '2026-07-22T12:00:00.000Z',
  });
  recordSessionBranch({
    source: 'cursor',
    sessionId: 'session-3',
    cwd: repo,
    observedAt: '2026-07-22T13:00:00.000Z',
  });
  assert.deepEqual(
    sessionsForBranch(
      'https://github.com/rudder-test/example.git',
      'refs/heads/feature/session-list'
    ).map(
      ({ source, sessionId }) => `${source}:${sessionId}`
    ),
    ['claude-code:session-1', 'codex:session-2', 'cursor:session-3']
  );
});

test('does not associate sessions from another branch', () => {
  git(repo, 'switch', 'main');
  recordSessionBranch({ source: 'codex', sessionId: 'main-session', cwd: repo });
  git(repo, 'switch', 'feature/session-list');

  assert.ok(
    sessionsForBranch(
      'github.com/rudder-test/example',
      'feature/session-list'
    ).every(
      ({ sessionId }) => sessionId !== 'main-session'
    )
  );
});

test('best-effort capture ignores sessions outside a Git repository', () => {
  const notes = join(root, 'notes');
  mkdirSync(notes);
  const result = tryRecordSessionBranch({
    source: 'claude',
    sessionId: 'non-git-session',
    cwd: notes,
    observedAt: '2026-07-24T12:00:00.000Z',
  });

  assert.equal(result, null);
  assert.deepEqual(branchesForSession('claude', 'non-git-session'), []);
});
