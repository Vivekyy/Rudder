import { spawnSync } from 'node:child_process';

/** The LLM CLI rudder shells out to for learned-rule sub-agents. */
export type Agent = 'claude' | 'codex';

export type SubagentRole = 'applicability' | 'writer' | 'verifier';

export type SubagentRunner = (
  agent: Agent,
  role: SubagentRole,
  instruction: string
) => string;

/**
 * Run one isolated TRACE role through the given agent CLI.
 *
 * Each invocation is a fresh child session with one responsibility and a strict
 * output contract. Keeping orchestration here works consistently across Claude
 * and Codex without depending on either CLI's product-specific delegation API.
 */
export const runSubagent: SubagentRunner = (agent, role, instruction) => {
  const cmd =
    agent === 'claude'
      ? { bin: 'claude', args: ['-p'] }
      : { bin: 'codex', args: ['exec', '-'] };

  const res = spawnSync(cmd.bin, cmd.args, {
    input: `You are Rudder's ${role} sub-agent. Perform only this role.\n\n${instruction}`,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      RUDDER_DISABLE: '1',
      RUDDER_CHILD_SESSION: '1',
    },
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
};

/** Pick an agent: the caller's preference, else claude, else codex. */
export function resolveAgent(preferred?: Agent): Agent {
  if (preferred) return preferred;
  const has = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
  if (has('claude')) return 'claude';
  if (has('codex')) return 'codex';
  throw new Error('Neither `claude` nor `codex` was found on your PATH.');
}
