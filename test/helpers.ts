// Shared test utilities. This file is intentionally NOT named `*.test.ts` so the
// `node --test` runner doesn't treat it as a suite — it only exports helpers.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

/** Make a fresh temp directory and return its path. */
export function tmpDir(prefix = 'rudder-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Run `fn` with `process.stdin` replaced by a stream that yields `payload` and
 * then ends (isTTY = false so hooks read it). Restores the real stdin after.
 */
export async function withFakeStdin<T>(payload: string, fn: () => Promise<T> | T): Promise<T> {
  const fake = Readable.from([payload]) as unknown as NodeJS.ReadStream;
  fake.isTTY = false;
  const orig = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, 'stdin', { value: orig, configurable: true });
  }
}

/** Run `fn` with `process.stdin.isTTY = true` (so readStdin resolves to ''). */
export async function withTtyStdin<T>(fn: () => Promise<T> | T): Promise<T> {
  const fake = Readable.from([]) as unknown as NodeJS.ReadStream;
  fake.isTTY = true;
  const orig = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, 'stdin', { value: orig, configurable: true });
  }
}

export interface StubOpts {
  /** Exit code for the non-`--version` invocation (default 0). */
  exit?: number;
  /** Text written to stdout (default 'DIGEST BODY'). */
  out?: string;
  /** Text written to stderr (default ''). */
  err?: string;
}

/**
 * Write an executable shell stub named `name` into `dir`. It exits 0 for any
 * `--version` probe (so resolveAgent treats it as installed) and otherwise
 * drains stdin, emits the configured stdout/stderr, and exits with `exit`.
 */
export function makeStubBin(dir: string, name: string, opts: StubOpts = {}): string {
  const { exit = 0, out = 'DIGEST BODY', err = '' } = opts;
  const p = join(dir, name);
  const lines = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "stub 1.0.0"; exit 0; fi',
    'cat >/dev/null 2>&1', // drain piped instruction so the writer doesn't EPIPE
  ];
  if (out) lines.push(`printf '%s' ${shSingleQuote(out)}`);
  if (err) lines.push(`printf '%s' ${shSingleQuote(err)} 1>&2`);
  lines.push(`exit ${exit}`);
  writeFileSync(p, lines.join('\n') + '\n');
  chmodSync(p, 0o755);
  return p;
}

/** POSIX single-quote escaping for embedding a literal in a shell script. */
function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Thrown by the process.exit stub so callers can observe the requested code. */
export class ExitSignal extends Error {
  code: number | undefined;
  constructor(code: number | undefined) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

export interface MainResult {
  stdout: string;
  stderr: string;
  /** The code passed to process.exit, or null if main returned without exiting. */
  exitCode: number | null;
}

/**
 * Invoke `main(argv)` with stdout/stderr captured and process.exit stubbed to
 * throw an ExitSignal (so the test process survives). Returns captured output
 * and the exit code (null when main returned normally).
 */
export async function runMain(
  main: (argv: string[]) => Promise<void>,
  argv: string[]
): Promise<MainResult> {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  let exitCode: number | null = null;

  process.stdout.write = ((s: string | Uint8Array) => {
    out.push(s.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => {
    err.push(s.toString());
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new ExitSignal(code);
  }) as typeof process.exit;

  try {
    await main(argv);
  } catch (e) {
    if (!(e instanceof ExitSignal)) {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exit = origExit;
  }
  return { stdout: out.join(''), stderr: err.join(''), exitCode };
}
