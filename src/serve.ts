import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { localDay, rudderPort } from './db.ts';
import { statsForDay } from './tags.ts';
import { ensureTagged } from './tagger.ts';
import { resolveAgent, type Agent } from './agent.ts';
import { PAGE_HTML } from './ui.ts';

export interface ServeOptions {
  agent?: Agent;
  /** Don't open a browser window (used so a foreground run can be scripted). */
  noOpen?: boolean;
}

/** How long to wait after the last prompt notification before tagging. */
const DEBOUNCE_MS = 1500;

function send(res: http.ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

/**
 * Open the dashboard in a chromeless Chrome "app" window when possible, falling
 * back through other Chromium browsers and finally the default browser. macOS
 * only for the app-window treatment; elsewhere we just open the default browser.
 */
function openWindow(url: string): void {
  if (process.platform === 'darwin') {
    const apps = ['Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Chromium'];
    for (const app of apps) {
      const r = spawnSync('open', ['-na', app, '--args', `--app=${url}`], { stdio: 'ignore' });
      if (r.status === 0) return;
    }
    spawnSync('open', [url], { stdio: 'ignore' }); // default browser
    return;
  }
  const opener = process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch {
    /* headless / no browser — the URL is printed for the user to open manually */
  }
}

export function serve(opts: ServeOptions = {}): void {
  const port = rudderPort();
  const url = `http://127.0.0.1:${port}/`;

  // Resolve the tagging agent once; tolerate none (dashboard still serves stored stats).
  let agent: Agent | undefined;
  try {
    agent = resolveAgent(opts.agent);
  } catch {
    process.stderr.write('rudder: no claude/codex on PATH — serving stored stats without live tagging.\n');
  }

  const clients = new Set<http.ServerResponse>();
  let debounce: NodeJS.Timeout | null = null;
  let tagging = false;
  let pending = false;

  function broadcast(): void {
    const payload = `data: ${JSON.stringify(statsForDay(localDay()))}\n\n`;
    for (const c of clients) c.write(payload);
  }

  // Tag any untagged prompts for today, then push fresh stats to every client.
  // Coalesces overlapping runs so a burst of prompts triggers at most one extra.
  async function tagAndBroadcast(): Promise<void> {
    if (tagging) {
      pending = true;
      return;
    }
    tagging = true;
    try {
      if (agent) ensureTagged(localDay(), agent);
    } finally {
      tagging = false;
      broadcast();
      if (pending) {
        pending = false;
        void tagAndBroadcast();
      }
    }
  }

  function scheduleTagging(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void tagAndBroadcast();
    }, DEBOUNCE_MS);
  }

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url || '/', url);

    if (req.method === 'POST' && pathname === '/notify') {
      scheduleTagging();
      send(res, 204, 'text/plain', '');
      return;
    }

    if (pathname === '/api/stats') {
      const day = new URL(req.url || '/', url).searchParams.get('day') || localDay();
      send(res, 200, 'application/json', JSON.stringify(statsForDay(day)));
      return;
    }

    if (pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(statsForDay(localDay()))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (pathname === '/') {
      send(res, 200, 'text/html; charset=utf-8', PAGE_HTML);
      return;
    }

    send(res, 404, 'text/plain', 'not found');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // A daemon is already running — just open (another) window and exit.
      console.log(`rudder: dashboard already running at ${url}`);
      if (!opts.noOpen) openWindow(url);
      process.exit(0);
    }
    throw err;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`rudder: dashboard at ${url} (Ctrl-C to stop)`);
    // Backfill any prompts captured while the daemon was down, then show the window.
    void tagAndBroadcast();
    if (!opts.noOpen) openWindow(url);
  });
}
