import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, delimiter, dirname } from 'node:path';
import fixPath from 'fix-path';
import { agentEnvPath, agentPath, setAgentEnvPath } from './settings.ts';

/** The LLM CLI rudder shells out to for digests and tagging. */
export type Agent = 'claude' | 'codex';

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

function agentFromPath(path: string | null): Agent | null {
  const name = path ? basename(path).toLowerCase() : '';
  if (name.includes('claude')) return 'claude';
  if (name.includes('codex')) return 'codex';
  return null;
}

function executableForAgent(agent: Agent): string {
  const configured = agentPath();
  return configured && existsSync(configured) && agentFromPath(configured) === agent
    ? configured
    : agent;
}

/**
 * GUI-launched desktop apps often inherit a minimal PATH, especially on macOS.
 * `fix-path` imports the user's shell PATH; Rudder caches the result in app data
 * and prepends any manually configured agent executable directory.
 */
export function hydrateAgentPath(): string {
  if (pathHydrated) return currentPath();
  pathHydrated = true;
  const before = currentPath();
  const configured = agentPath();
  const cached = agentEnvPath();
  if (cached) {
    const next = mergePathValues(configured ? dirname(configured) : undefined, cached, before);
    setCurrentPath(next);
    return next;
  }
  fixPath();
  const next = mergePathValues(configured ? dirname(configured) : undefined, currentPath(), before);
  setCurrentPath(next);
  if (next) setAgentEnvPath(next);
  return next;
}

export function resetAgentPathCache(): void {
  pathHydrated = false;
}

/** Run `instruction` through the given agent's CLI and return its stdout. */
export function runAgent(agent: Agent, instruction: string): string {
  hydrateAgentPath();
  const cmd =
    agent === 'claude'
      ? { bin: executableForAgent('claude'), args: ['-p'] }
      : { bin: executableForAgent('codex'), args: ['exec', '-'] };

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
  const configured = agentPath();
  const configuredAgent = agentFromPath(configured);
  if (configured && configuredAgent && existsSync(configured)) return configuredAgent;
  const has = (agent: Agent) =>
    spawnSync(executableForAgent(agent), ['--version'], { encoding: 'utf8' }).status === 0;
  if (has('claude')) return 'claude';
  if (has('codex')) return 'codex';
  throw new Error('Neither `claude` nor `codex` was found on your PATH.');
}
