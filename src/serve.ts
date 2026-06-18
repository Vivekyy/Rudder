import http from 'node:http';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { localDay, rudderPort } from './db.ts';
import { statsForDay } from './tags.ts';
import { ensureTagged } from './tagger.ts';
import { resolveAgent, type Agent } from './agent.ts';
import { PAGE_HTML, INSTALL_HTML, MANIFEST, SERVICE_WORKER } from './ui.ts';
import { pngIcon } from './icon.ts';

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
 * Look for the installed PWA's `.app` bundle (macOS). Chrome/Edge/Brave install
 * PWAs into "<Browser> Apps.localized" folders; Safari's "Add to Dock" web apps
 * land directly in ~/Applications. We match a bundle whose name contains
 * "rudder". Returns the bundle path, or null if not found / not macOS.
 */
function findInstalledApp(): string | null {
  if (process.platform !== 'darwin') return null;
  const home = homedir();
  const dirs = [
    join(home, 'Applications', 'Chrome Apps.localized'),
    join(home, 'Applications', 'Chrome Apps'),
    join(home, 'Applications', 'Edge Apps.localized'),
    join(home, 'Applications', 'Brave Apps.localized'),
    join(home, 'Applications'),
    '/Applications',
  ];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    const hit = entries.find((e) => e.endsWith('.app') && /rudder/i.test(e));
    if (hit) return join(dir, hit);
  }
  return null;
}

function spawnDetached(bin: string, args: string[]): void {
  try {
    spawn(bin, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* headless / nothing to open — the URL is printed for the user to open manually */
  }
}

/** Open a URL in the user's default browser (cross-platform). */
function openBrowser(url: string): void {
  if (process.platform === 'darwin') spawnDetached('open', [url]);
  else if (process.platform === 'win32') spawnDetached('cmd', ['/c', 'start', '', url]);
  else spawnDetached('xdg-open', [url]);
}

/**
 * Make the app first-class: if it's already installed, launch the standalone app
 * directly (it loads the dashboard from this daemon). Otherwise open the focused
 * installer page in a browser tab — not the in-browser dashboard.
 */
function openDashboard(baseUrl: string): void {
  const app = findInstalledApp();
  if (app) {
    console.log(`rudder: opening installed app (${app})`);
    spawnDetached('open', [app]);
  } else {
    console.log('rudder: opening installer — install the app, then `rudder start` opens it directly');
    openBrowser(`${baseUrl}install`);
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

    if (pathname === '/manifest.webmanifest') {
      send(res, 200, 'application/manifest+json', MANIFEST);
      return;
    }

    if (pathname === '/sw.js') {
      send(res, 200, 'text/javascript', SERVICE_WORKER);
      return;
    }

    if (pathname === '/icon-192.png' || pathname === '/icon-512.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' });
      res.end(pngIcon(pathname.includes('512') ? 512 : 192));
      return;
    }

    if (pathname === '/install') {
      send(res, 200, 'text/html; charset=utf-8', INSTALL_HTML);
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
      // A daemon is already running — just open the app/installer and exit.
      console.log(`rudder: dashboard already running at ${url}`);
      if (!opts.noOpen) openDashboard(url);
      process.exit(0);
    }
    throw err;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`rudder: dashboard at ${url} (Ctrl-C to stop)`);
    // Backfill any prompts captured while the daemon was down, then open.
    void tagAndBroadcast();
    if (!opts.noOpen) openDashboard(url);
  });
}
