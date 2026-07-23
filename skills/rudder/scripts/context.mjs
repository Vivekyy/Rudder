#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}

function git(cwd, args, optional = false) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return result.stdout.trim();
  if (optional) return null;
  throw new Error(
    result.stderr.trim() || `git ${args.join(' ')} exited with ${result.status}`
  );
}

function gitNullList(cwd, args) {
  const output = execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

function strippedRepositoryPath(path) {
  return path.replace(/^\/+|\/+$/gu, '').replace(/\.git$/u, '');
}

function normalizeRepository(repository) {
  const value = repository.trim();
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/u.exec(value);
  if (scp && !value.includes('://')) {
    return `${scp[1].toLowerCase()}/${strippedRepositoryPath(scp[2])}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'file:') {
      return `${url.host.toLowerCase()}/${strippedRepositoryPath(
        decodeURIComponent(url.pathname)
      )}`;
    }
  } catch {
    // Treat non-URL values as local paths.
  }
  return strippedRepositoryPath(value);
}

function repositoryKey(root, branch) {
  const branchRemote = git(
    root,
    ['config', '--get', `branch.${branch}.remote`],
    true
  );
  const remoteNames = [
    branchRemote && branchRemote !== '.' ? branchRemote : null,
    'origin',
    ...((git(root, ['remote'], true) ?? '').split('\n').filter(Boolean)),
  ].filter(Boolean);

  for (const remoteName of new Set(remoteNames)) {
    const remote = git(root, ['remote', 'get-url', remoteName], true);
    if (remote) return normalizeRepository(remote);
  }

  const commonDir = git(root, ['rev-parse', '--git-common-dir']);
  const absolute = realpathSync(resolve(root, commonDir));
  return `local:${createHash('sha256').update(absolute).digest('hex')}`;
}

function resolveBase(root, requested) {
  const candidates = requested
    ? [requested]
    : [
        git(
          root,
          ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
          true
        ),
        'origin/main',
        'main',
        'origin/master',
        'master',
      ];

  for (const candidate of candidates.filter(Boolean)) {
    if (git(root, ['rev-parse', '--verify', '--quiet', candidate], true)) {
      return candidate;
    }
  }
  return 'HEAD';
}

function isTestPath(path) {
  const normalized = path.replaceAll('\\', '/');
  const file = basename(normalized);
  return (
    /(^|\/)(__tests__|tests?|specs?|testdata|fixtures?)(\/|$)/iu.test(
      normalized
    ) ||
    /\.(test|spec)\.[^.]+$/iu.test(file) ||
    /^(test_.+|.+_test)\.[^.]+$/iu.test(file)
  );
}

function storedPrompts(repository, branch) {
  const stateRoot = process.env.RUDDER_HOME || join(homedir(), '.rudder');
  const databasePath = join(stateRoot, 'rudder.db');
  if (!existsSync(databasePath)) return { databasePath, prompts: [] };

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const table = database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'prompt_branches'"
      )
      .get();
    if (!table) return { databasePath, prompts: [] };

    const prompts = database
      .prepare(
        `SELECT source,
                session_id AS sessionId,
                prompt_id AS promptId,
                prompt_text AS promptText,
                submitted_at AS submittedAt,
                reconciled_at AS reconciledAt
           FROM prompt_branches
          WHERE repository = ? AND branch = ?
          ORDER BY submitted_at, source, session_id, prompt_id`
      )
      .all(repository, branch);
    return { databasePath, prompts };
  } finally {
    database.close();
  }
}

function main() {
  const args = process.argv.slice(2);
  const cwd = realpathSync(argumentValue(args, '--cwd') ?? process.cwd());
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch) throw new Error('Rudder requires an attached Git branch');

  const baseRef = resolveBase(root, argumentValue(args, '--base'));
  const mergeBase = git(root, ['merge-base', 'HEAD', baseRef]);
  const tracked = gitNullList(root, [
    'diff',
    '--name-only',
    '-z',
    mergeBase,
    '--',
  ]);
  const untracked = gitNullList(root, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  const changedPaths = [...new Set([...tracked, ...untracked])].sort();
  const testPaths = changedPaths.filter(isTestPath);
  const otherPaths = changedPaths.filter((path) => !isTestPath(path));
  const repository = repositoryKey(root, branch);
  const promptData = storedPrompts(repository, branch);

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        root,
        repository,
        branch,
        baseRef,
        mergeBase,
        changedPaths,
        testPaths,
        otherPaths,
        untrackedPaths: untracked.sort(),
        promptDatabasePath: promptData.databasePath,
        prompts: promptData.prompts,
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
