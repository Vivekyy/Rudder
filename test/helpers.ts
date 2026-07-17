import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempHome {
  path: string;
  restore(): void;
}

export function useTempHome(prefix = 'rudder-test-'): TempHome {
  const path = mkdtempSync(join(tmpdir(), prefix));
  const previousHome = process.env.HOME;
  const previousRudderHome = process.env.RUDDER_HOME;
  process.env.HOME = path;
  process.env.RUDDER_HOME = path;

  return {
    path,
    restore() {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousRudderHome === undefined) delete process.env.RUDDER_HOME;
      else process.env.RUDDER_HOME = previousRudderHome;
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export async function withStdin(input: string, fn: () => Promise<void>): Promise<void> {
  const { Readable } = await import('node:stream');
  const fake = Readable.from([input]) as unknown as NodeJS.ReadStream;
  fake.isTTY = false;
  const original = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
  try {
    await fn();
  } finally {
    Object.defineProperty(process, 'stdin', { value: original, configurable: true });
  }
}

export function runRudder(
  args: string[],
  home: string,
  env: NodeJS.ProcessEnv = {}
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(process.cwd(), 'bin', 'rudder.ts'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      RUDDER_HOME: home,
      ...env,
    },
  });
}
