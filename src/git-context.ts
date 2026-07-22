import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BranchContext {
  repository: string;
  branch: string;
}

export class BranchResolutionError extends Error {
  readonly cwd: string;

  constructor(cwd: string, message: string) {
    super(`Cannot resolve a Git branch from ${cwd}: ${message}`);
    this.name = 'BranchResolutionError';
    this.cwd = cwd;
  }
}

function git(cwd: string, args: string[], optional = false): string | null {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    if (optional) return null;
    throw new BranchResolutionError(cwd, result.error.message);
  }
  if (result.status !== 0) {
    if (optional) return null;
    const detail = result.stderr.trim() || `git exited with status ${result.status}`;
    throw new BranchResolutionError(cwd, detail);
  }
  return result.stdout.trim() || null;
}

function strippedRepositoryPath(path: string): string {
  return path.replace(/^\/+|\/+$/gu, '').replace(/\.git$/u, '');
}

/** Normalize common HTTPS, SSH, and SCP-style Git remotes to a stable key. */
export function normalizeRepository(repository: string): string {
  const value = repository.trim();
  if (!value) throw new TypeError('repository must not be blank');

  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/u.exec(value);
  if (scp && !value.includes('://')) {
    return `${scp[1]!.toLowerCase()}/${strippedRepositoryPath(scp[2]!)}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'file:') {
      const path = strippedRepositoryPath(decodeURIComponent(url.pathname));
      if (!path) throw new TypeError('repository URL must include a path');
      return `${url.host.toLowerCase()}/${path}`;
    }
  } catch (error) {
    if (error instanceof TypeError && value.includes('://')) throw error;
  }

  return strippedRepositoryPath(value);
}

function localRepositoryKey(cwd: string, commonDir: string): string {
  const absolute = realpathSync(resolve(cwd, commonDir));
  return `local:${createHash('sha256').update(absolute).digest('hex')}`;
}

function repositoryRemote(cwd: string, branch: string): string | null {
  const branchRemote = git(cwd, ['config', '--get', `branch.${branch}.remote`], true);
  if (branchRemote && branchRemote !== '.') {
    const remoteUrl = git(cwd, ['remote', 'get-url', branchRemote], true);
    if (remoteUrl) return remoteUrl;
  }

  const origin = git(cwd, ['remote', 'get-url', 'origin'], true);
  if (origin) return origin;

  const firstRemote = git(cwd, ['remote'], true)?.split('\n')[0];
  return firstRemote ? git(cwd, ['remote', 'get-url', firstRemote], true) : null;
}

export function normalizeBranch(branch: string): string {
  const normalized = branch.trim().replace(/^refs\/heads\//u, '');
  if (!normalized) throw new TypeError('branch must not be blank');
  return normalized;
}

/** Resolve the portable repository/branch tuple used to associate prompts. */
export function resolveBranchContext(cwd: string = process.cwd()): BranchContext {
  const start = realpathSync(cwd);
  const root = git(start, ['rev-parse', '--show-toplevel'])!;
  const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch) throw new BranchResolutionError(start, 'HEAD is detached');

  const remote = repositoryRemote(root, branch);
  const repository = remote
    ? normalizeRepository(remote)
    : localRepositoryKey(root, git(root, ['rev-parse', '--git-common-dir'])!);

  return { repository, branch: normalizeBranch(branch) };
}
