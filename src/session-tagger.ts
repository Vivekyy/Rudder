import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, asc, eq, sql } from 'drizzle-orm';
import { rudderDb } from './db/client.ts';
import { sessionBranches } from './db/schema.ts';

export interface BranchContext {
  repository: string;
  branch: string;
}

export interface SessionBranchRow {
  /** Namespace for the session ID, such as `claude-code` or `codex`. */
  source: string;
  sessionId: string;
  repository: string;
  branch: string;
  /** The first time this session was observed on the repository branch. */
  observedAt: string;
}

export interface RecordSessionBranchInput {
  source: string;
  sessionId: string;
  cwd?: string;
  observedAt?: string | Date;
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

function isLocalRepositoryKey(repository: string): boolean {
  return /^local:[0-9a-f]{64}$/u.test(repository);
}

/** Normalize common HTTPS, SSH, and SCP-style Git remotes to a stable key. */
export function normalizeRepository(repository: string): string {
  const value = repository.trim();
  if (!value) throw new TypeError('repository must not be blank');
  if (isLocalRepositoryKey(value)) return value;

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

function normalizedBranch(branch: string): string {
  const normalized = branch.trim().replace(/^refs\/heads\//u, '');
  if (!normalized) throw new TypeError('branch must not be blank');
  return normalized;
}

/** Resolve the portable repository/branch tuple used to associate sessions. */
export function resolveBranchContext(cwd: string = process.cwd()): BranchContext {
  const start = realpathSync(cwd);
  const root = git(start, ['rev-parse', '--show-toplevel'])!;
  const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch) throw new BranchResolutionError(start, 'HEAD is detached');

  const remote = repositoryRemote(root, branch);
  const repository = remote
    ? normalizeRepository(remote)
    : localRepositoryKey(root, git(root, ['rev-parse', '--git-common-dir'])!);

  return { repository, branch: normalizedBranch(branch) };
}

function timestamp(value: string | Date | undefined, field: string): string {
  const date = value instanceof Date ? value : value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
}

function validatedSource(source: string): string {
  const normalized = source.trim();
  if (!normalized) throw new TypeError('source must not be blank');
  return normalized;
}

function validatedSessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!normalized) throw new TypeError('sessionId must not be blank');
  return normalized;
}

/** Record the first time a session is observed on a repository branch. */
export function recordSessionBranch(input: RecordSessionBranchInput): SessionBranchRow {
  const source = validatedSource(input.source);
  const sessionId = validatedSessionId(input.sessionId);
  const context = resolveBranchContext(input.cwd);
  const observedAt = timestamp(input.observedAt, 'observedAt');

  rudderDb()
    .insert(sessionBranches)
    .values({
      source,
      sessionId,
      repository: context.repository,
      branch: context.branch,
      observedAt,
    })
    .onConflictDoUpdate({
      target: [
        sessionBranches.source,
        sessionBranches.sessionId,
        sessionBranches.repository,
        sessionBranches.branch,
      ],
      set: {
        observedAt: sql`min(${sessionBranches.observedAt}, ${observedAt})`,
      },
    })
    .run();

  return rudderDb()
    .select()
    .from(sessionBranches)
    .where(
      and(
        eq(sessionBranches.source, source),
        eq(sessionBranches.sessionId, sessionId),
        eq(sessionBranches.repository, context.repository),
        eq(sessionBranches.branch, context.branch)
      )
    )
    .get() as SessionBranchRow;
}

/** Best-effort capture for hooks that must continue outside Git repositories. */
export function tryRecordSessionBranch(
  input: RecordSessionBranchInput
): SessionBranchRow | null {
  try {
    return recordSessionBranch(input);
  } catch {
    return null;
  }
}

export function branchesForSession(source: string, sessionId: string): SessionBranchRow[] {
  const normalizedSource = validatedSource(source);
  const normalizedSessionId = validatedSessionId(sessionId);
  return rudderDb()
    .select()
    .from(sessionBranches)
    .where(
      and(
        eq(sessionBranches.source, normalizedSource),
        eq(sessionBranches.sessionId, normalizedSessionId)
      )
    )
    .orderBy(
      asc(sessionBranches.observedAt),
      asc(sessionBranches.repository),
      asc(sessionBranches.branch)
    )
    .all() as SessionBranchRow[];
}

/** Return every session observed on a repository branch. */
export function sessionsForBranch(
  repository: string,
  branch: string
): SessionBranchRow[] {
  const normalizedRepository = normalizeRepository(repository);
  const normalizedBranchName = normalizedBranch(branch);
  return rudderDb()
    .select()
    .from(sessionBranches)
    .where(
      and(
        eq(sessionBranches.repository, normalizedRepository),
        eq(sessionBranches.branch, normalizedBranchName)
      )
    )
    .orderBy(
      asc(sessionBranches.observedAt),
      asc(sessionBranches.source),
      asc(sessionBranches.sessionId)
    )
    .all() as SessionBranchRow[];
}
