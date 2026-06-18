import { spawnSync } from 'node:child_process';

/** The LLM CLI rudder shells out to for digests and tagging. */
export type Agent = 'claude' | 'codex';

/**
 * Run `instruction` through the given agent's CLI and return its stdout.
 *
 * `RUDDER_DISABLE=1` is set on the spawned process so the agent we invoke does
 * not re-trigger rudder's own capture hooks and record this instruction as a
 * prompt for the day.
 */
export function runAgent(agent: Agent, instruction: string): string {
  const cmd =
    agent === 'claude'
      ? { bin: 'claude', args: ['-p'] }
      : { bin: 'codex', args: ['exec', '-'] };

  const res = spawnSync(cmd.bin, cmd.args, {
    input: instruction,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, RUDDER_DISABLE: '1' },
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
  const has = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
  if (has('claude')) return 'claude';
  if (has('codex')) return 'codex';
  throw new Error('Neither `claude` nor `codex` was found on your PATH.');
}
