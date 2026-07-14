import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PostHog } from 'posthog-node';
import { rudderHome } from './db/index.ts';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

export function telemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DO_NOT_TRACK === '1';
}

/** Read or generate a stable anonymous installation ID. */
function loadDistinctId(): string {
  const idPath = join(rudderHome(), 'identity.json');
  try {
    if (existsSync(idPath)) {
      const obj = JSON.parse(readFileSync(idPath, 'utf8')) as Record<string, unknown>;
      if (typeof obj.id === 'string' && obj.id) return obj.id;
    }
  } catch {
    // fall through to generate a new one
  }
  const id = randomUUID();
  try {
    mkdirSync(rudderHome(), { recursive: true });
    writeFileSync(idPath, JSON.stringify({ id }));
  } catch {
    // best-effort; use an in-memory ID if we can't persist
  }
  return id;
}

let _client: PostHog | null = null;
let _distinctId: string | null = null;

function client(): PostHog | null {
  if (!POSTHOG_API_KEY || telemetryDisabled()) return null;
  if (!_client) {
    _client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // CLI invocations are short-lived; send immediately so events aren't lost.
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    });
  }
  return _client;
}

export function distinctId(): string {
  if (!_distinctId) _distinctId = loadDistinctId();
  return _distinctId;
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  client()?.capture({ distinctId: distinctId(), event, properties });
}

export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  client()?.captureException(err, distinctId(), extra);
}

export async function shutdown(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
}
