#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

function argumentValue(args, name, required = false) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (required) throw new TypeError(`${name} is required`);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}

function argumentValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new TypeError(`${name} requires a value`);
    }
    values.push(value);
    index += 1;
  }
  return values;
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

function nullList(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function safeRelativePath(root, path) {
  const absolute = resolve(root, path);
  const normalized = relative(root, absolute);
  if (!normalized || normalized === '..' || normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`path must stay inside the repository: ${path}`);
  }
  return normalized;
}

function main() {
  const args = process.argv.slice(2);
  const cwd = argumentValue(args, '--cwd', true);
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  const baseRef = argumentValue(args, '--base') ?? 'HEAD';
  if (!git(root, ['rev-parse', '--verify', '--quiet', baseRef], true)) {
    throw new Error(`base ref does not exist: ${baseRef}`);
  }
  const mergeBase = git(root, ['merge-base', 'HEAD', baseRef]);
  const paths = [
    ...new Set(
      argumentValues(args, '--path').map((path) =>
        safeRelativePath(root, path)
      )
    ),
  ].sort();
  if (paths.length === 0) {
    throw new Error('at least one --path is required');
  }

  const untracked = new Set(
    nullList(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  );
  const stateRoot = process.env.RUDDER_HOME || join(homedir(), '.rudder');
  const backupRoot = join(stateRoot, 'backups');
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const backupDirectory = mkdtempSync(join(backupRoot, 'test-reset-'));
  const patchPath = join(backupDirectory, 'tracked.patch');
  const patch = execFileSync(
    'git',
    ['-C', root, 'diff', '--binary', mergeBase, '--', ...paths]
  );
  writeFileSync(patchPath, patch, { mode: 0o600 });

  const copiedUntrackedPaths = [];
  for (const path of paths) {
    if (!untracked.has(path)) continue;
    const destination = join(backupDirectory, 'untracked', path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(root, path), destination, {
      recursive: true,
      preserveTimestamps: true,
    });
    copiedUntrackedPaths.push(path);
  }

  const metadata = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    repositoryRoot: root,
    baseRef,
    mergeBase,
    paths,
    patchPath,
    copiedUntrackedPaths,
  };
  const metadataPath = join(backupDirectory, 'metadata.json');
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  process.stdout.write(
    `${JSON.stringify(
      { backupDirectory, metadataPath, ...metadata },
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
