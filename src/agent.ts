import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** The LLM CLI rudder shells out to for digests and tagging. */
export type Agent = 'claude' | 'codex';

const SHELL_PATH_TIMEOUT_MS = 1500;
let pathHydrated = false;

function currentPath(): string {
  return process.env.PATH || process.env.Path || '';
}

function setCurrentPath(path: string): void {
  process.env.PATH = path;
  if (process.platform === 'win32') process.env.Path = path;
}

/** Merge PATH strings while preserving first-seen order and removing blanks. */
export function mergePathValues(...values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    for (const part of (value || '').split(delimiter)) {
      if (!part || seen.has(part)) continue;
      seen.add(part);
      parts.push(part);
    }
  }
  return parts.join(delimiter);
}

function shellPath(): string {
  if (process.platform === 'win32') return '';
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const res = spawnSync(shell, ['-lc', 'printf %s "$PATH"'], {
    encoding: 'utf8',
    env: { ...process.env, RUDDER_DISABLE: '1' },
    timeout: SHELL_PATH_TIMEOUT_MS,
  });
  return res.status === 0 ? res.stdout.trim() : '';
}

function commonAgentDirs(): string {
  const home = homedir();
  const candidates = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    home ? join(home, '.local', 'bin') : '',
    home ? join(home, '.npm-global', 'bin') : '',
    home ? join(home, '.cargo', 'bin') : '',
  ];
  return candidates.filter((path) => path && existsSync(path)).join(delimiter);
}

/**
 * GUI-launched desktop apps often inherit a minimal PATH, especially on macOS.
 * Hydrate it once from the user's shell plus common install locations before
 * looking for `claude` or `codex`.
 */
export function hydrateAgentPath(): string {
  if (pathHydrated) return currentPath();
  pathHydrated = true;
  const next = mergePathValues(currentPath(), shellPath(), commonAgentDirs());
  setCurrentPath(next);
  return next;
}

/** Run `instruction` through the given agent's CLI and return its stdout. */
export function runAgent(agent: Agent, instruction: string): string {
  hydrateAgentPath();
  const cmd =
    agent === 'claude'
      ? { bin: 'claude', args: ['-p'] }
      : { bin: 'codex', args: ['exec', '-'] };

  const res = spawnSync(cmd.bin, cmd.args, {
    input: instruction,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, RUDDER_DISABLE: '1' }, // don't let this spawn re-trigger our hooks
  });

  if (res.error) {
    const e = res.error as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(`'${cmd.bin}' was not found on your PATH.`);
    }
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`'${cmd.bin}' exited with code ${res.status}:\n${res.stderr}`);
  }
  return (res.stdout || '').trim();
}

/** Pick an agent: the caller's preference, else claude, else codex. */
export function resolveAgent(preferred?: Agent): Agent {
  if (preferred) return preferred;
  hydrateAgentPath();
  const has = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
  if (has('claude')) return 'claude';
  if (has('codex')) return 'codex';
  throw new Error('Neither `claude` nor `codex` was found on your PATH.');
}
