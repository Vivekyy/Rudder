import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rudderPort } from './db/index.ts';
import { ensureCompiled } from './compiler.ts';
import { resolveAgent, type Agent } from './agent.ts';
import {
  allActiveRules,
  createManualRule,
  deleteManualRule,
  pendingTraceEvents,
  setManualRuleEnforced,
  updateManualRule,
} from './rules.ts';
import { svgIcon } from './icon.ts';
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

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json', JSON.stringify(body));
}

function ruleIdFromPath(pathname: string, suffix = ''): number | null {
  const match = pathname.match(new RegExp(`^/api/rules/(\\d+)${suffix}$`));
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) throw new Error('request body too large');
  }
  if (!body.trim()) return {};
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function frontendDist(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = dirname(modulePath);
  return modulePath.endsWith('.js')
    ? resolve(moduleDir, '..', 'frontend')
    : resolve(moduleDir, '..', 'dist', 'frontend');
}

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
    case '.webmanifest':
      return 'application/manifest+json';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function staticPath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = normalize(decoded.replace(/^\/+/, ''));
  if (!relative || relative.startsWith('..') || relative.includes(`${sep}..${sep}`)) return null;
  const fullPath = resolve(root, relative);
  return fullPath === root || fullPath.startsWith(root + sep) ? fullPath : null;
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
  const frontendRoot = frontendDist();

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
    const pending = pendingTraceEvents();
    return {
      active_rules: allActiveRules(),
      pending_prompts: pending.length,
      pending_rules: pending.map((event) => ({
        id: event.id,
        ts: event.ts,
        source: event.source,
        project: event.project,
        task_text: event.task_text,
        behavior_text: event.behavior_text,
        attempts: event.attempts,
      })),
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
  //   POST /api/rules             create a manual rule
  //   PUT  /api/rules/:id         create a new version with edited text/details
  //   PATCH /api/rules/:id/enforced toggle Preference/Rule enforcement
  //   DELETE /api/rules/:id       mark the active rule inactive
  //   GET  /events                Server-Sent Events stream of rule state
  //   GET  /manifest.webmanifest  PWA manifest from the built frontend
  //   GET  /sw.js                 pass-through service worker (PWA installability)
  //   GET  /icon.svg              SVG app icon
  //   GET  /*                    built React frontend with app fallback
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url || '/', url);

    try {
      if (req.method === 'POST' && pathname === '/notify') {
        scheduleCompilation();
        send(res, 204, 'text/plain', '');
        return;
      }

      if (req.method === 'GET' && pathname === '/api/rules') {
        sendJson(res, 200, ruleStatus());
        return;
      }

      if (req.method === 'POST' && pathname === '/api/rules') {
        const body = await readJson(req);
        createManualRule({
          ruleText: body.ruleText as string,
          appliesWhen: body.appliesWhen as string,
          doesNotApplyWhen: body.doesNotApplyWhen as string,
          enforced: body.enforced === true,
        });
        const status = ruleStatus();
        sendJson(res, 201, status);
        broadcast();
        return;
      }

      const editRuleId = req.method === 'PUT' ? ruleIdFromPath(pathname) : null;
      if (editRuleId !== null) {
        const body = await readJson(req);
        updateManualRule(editRuleId, {
          ruleText: body.ruleText as string,
          appliesWhen: body.appliesWhen as string,
          doesNotApplyWhen: body.doesNotApplyWhen as string,
          enforced: body.enforced === true,
        });
        const status = ruleStatus();
        sendJson(res, 200, status);
        broadcast();
        return;
      }

      const enforceRuleId =
        req.method === 'PATCH' ? ruleIdFromPath(pathname, '/enforced') : null;
      if (enforceRuleId !== null) {
        const body = await readJson(req);
        setManualRuleEnforced(enforceRuleId, body.enforced === true);
        const status = ruleStatus();
        sendJson(res, 200, status);
        broadcast();
        return;
      }

      const deleteRuleId = req.method === 'DELETE' ? ruleIdFromPath(pathname) : null;
      if (deleteRuleId !== null) {
        deleteManualRule(deleteRuleId);
        const status = ruleStatus();
        sendJson(res, 200, status);
        broadcast();
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

      if (pathname === '/icon.svg') {
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400' });
        res.end(svgIcon());
        return;
      }

      const requested = pathname === '/' || pathname === '/install' ? '/index.html' : pathname;
      const filePath = staticPath(frontendRoot, requested);
      if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
        send(res, 200, contentType(filePath), readFileSync(filePath, 'utf8'));
        return;
      }

      const indexPath = join(frontendRoot, 'index.html');
      if (!pathname.startsWith('/api/') && existsSync(indexPath)) {
        send(res, 200, 'text/html; charset=utf-8', readFileSync(indexPath, 'utf8'));
        return;
      }

      send(res, 404, 'text/plain', 'frontend assets not built; run npm run build');
    } catch (err) {
      const message = (err as Error).message || 'request failed';
      const status = /not found/.test(message) ? 404 : 400;
      sendJson(res, status, { error: message });
    }
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
