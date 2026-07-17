import http from 'node:http';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { rudderPort } from './db/index.ts';
import { ensureCompiled } from './compiler.ts';
import { resolveAgent, type Agent } from './agent.ts';
import { allActiveRules, pendingTraceEvents } from './rules.ts';
import { PAGE_HTML, INSTALL_HTML, MANIFEST, SERVICE_WORKER } from './ui.ts';
import { pngIcon, svgIcon } from './icon.ts';
import { capture, captureException } from './telemetry.ts';

export interface ServeOptions {
  agent?: Agent;
  /** Don't open a browser window (used so a foreground run can be scripted). */
  noOpen?: boolean;
}

/** How long to wait after the last prompt notification before compiling rules. */
const DEBOUNCE_MS = 1500;

function send(res: http.ServerResponse, status: number, type: string, body: string): void {
  // no-store so an updated dashboard/installer/manifest is never served stale.
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
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
    // Allowlist the bundle name (no shell metacharacters) before it ever reaches
    // a child process — this is the sanitizer, the launch uses spawn (no shell).
    const hit = entries.find((e) => /^[\w .()-]+\.app$/.test(e) && /rudder/i.test(e));
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

function openBrowser(url: string): void {
  // Direct exec, never a shell: `start` would need cmd.exe (a shell), so use the
  // non-shell openers on every platform.
  if (process.platform === 'darwin') spawnDetached('open', [url]);
  else if (process.platform === 'win32') spawnDetached('explorer.exe', [url]);
  else spawnDetached('xdg-open', [url]);
}

/**
 * If the app is already installed, launch the standalone app directly (it loads
 * the dashboard from this daemon). Otherwise open the focused installer page.
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

  // Resolve the compilation agent once; tolerate none (stored rules remain visible).
  let agent: Agent | undefined;
  try {
    agent = resolveAgent(opts.agent);
  } catch {
    process.stderr.write(
      'rudder: no claude/codex on PATH — serving stored rules without live compilation.\n'
    );
  }

  const clients = new Set<http.ServerResponse>();
  let debounce: NodeJS.Timeout | null = null;
  let compiling = false;
  let pending = false;

  function ruleStatus(): object {
    return {
      active_rules: allActiveRules(),
      pending_prompts: pendingTraceEvents().length,
    };
  }

  function broadcast(): void {
    const payload = `data: ${JSON.stringify(ruleStatus())}\n\n`;
    for (const c of clients) {
      try {
        c.write(payload);
      } catch {
        clients.delete(c);
      }
    }
  }

  // Compile every queued prompt, then push fresh rule state to every client.
  // Coalesces overlapping runs so a burst of prompts triggers at most one extra.
  async function compileAndBroadcast(): Promise<void> {
    if (compiling) {
      pending = true;
      return;
    }
    compiling = true;
    try {
      if (agent) ensureCompiled(agent);
    } finally {
      compiling = false;
      broadcast();
      if (pending) {
        pending = false;
        void compileAndBroadcast();
      }
    }
  }

  function scheduleCompilation(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void compileAndBroadcast();
    }, DEBOUNCE_MS);
  }

  // Routes:
  //   POST /notify                ping from the capture hook → schedule compilation
  //   GET  /api/rules             active rules and pending prompt count as JSON
  //   GET  /events                Server-Sent Events stream of rule state
  //   GET  /manifest.webmanifest  PWA manifest
  //   GET  /sw.js               pass-through service worker (PWA installability)
  //   GET  /icon.svg             SVG favicon
  //   GET  /icon-192|512.png     generated app icons
  //   GET  /install             installer landing page (opened when not installed)
  //   GET  /                    the dashboard (what the installed app shows)
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url || '/', url);

    if (req.method === 'POST' && pathname === '/notify') {
      scheduleCompilation();
      send(res, 204, 'text/plain', '');
      return;
    }

    if (pathname === '/api/rules') {
      send(res, 200, 'application/json', JSON.stringify(ruleStatus()));
      return;
    }

    if (pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(ruleStatus())}\n\n`);
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

    if (pathname === '/icon.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400' });
      res.end(svgIcon());
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
    captureException(err);
    throw err;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`rudder: dashboard at ${url} (Ctrl-C to stop)`);
    capture('dashboard started', {
      has_agent: agent !== undefined,
      no_open: opts.noOpen === true,
      platform: process.platform,
    });
    // Open first, then backfill. Compilation is synchronous (spawnSync) and
    // briefly blocks the event loop, so we defer it a beat to let the freshly
    // opened page load its assets before the daemon runs the sub-agent pipeline.
    if (!opts.noOpen) openDashboard(url);
    setTimeout(() => void compileAndBroadcast(), 1500);
  });
}
