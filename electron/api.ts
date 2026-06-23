import http from 'node:http';
import { ipcMain, shell, type BrowserWindow } from 'electron';
import {
  dbPath,
  ensureTagged,
  generateDigest,
  hookStatus,
  installHooks,
  localDay,
  resetAgentPathCache,
  resolveAgent,
  rudderPort,
  setAgentPath,
  statsForDay,
  agentPath,
  type Agent,
  type HookArgvProvider,
} from '../src/core.ts';
import type { GenerateDigestRequest, RudderSettings } from '../src/desktop-api.ts';

// This is a batching debounce, not an agent-call timeout.
const PROMPT_NOTIFY_DEBOUNCE_MS = 5000;

interface ApiContext {
  userDataPath: string;
  hookArgv: HookArgvProvider;
  mainWindow: () => BrowserWindow | null;
}

let notifyServer: http.Server | null = null;
let debounce: NodeJS.Timeout | null = null;
let tagging = false;
let pending = false;

function currentAgent(): Agent | null {
  try {
    return resolveAgent();
  } catch {
    return null;
  }
}

function currentSettings(context: ApiContext): RudderSettings {
  return {
    dbPath: dbPath(),
    userDataPath: context.userDataPath,
    agent: currentAgent(),
    agentPath: agentPath(),
  };
}

function broadcastToday(context: ApiContext): void {
  context.mainWindow()?.webContents.send('rudder:stats-updated', statsForDay(localDay()));
}

function tagAndBroadcast(context: ApiContext): void {
  if (tagging) {
    pending = true;
    return;
  }
  tagging = true;
  try {
    ensureTagged(localDay());
  } finally {
    tagging = false;
    broadcastToday(context);
    if (pending) {
      pending = false;
      tagAndBroadcast(context);
    }
  }
}

function scheduleTagging(context: ApiContext): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    tagAndBroadcast(context);
  }, PROMPT_NOTIFY_DEBOUNCE_MS);
}

function sendJson(res: http.ServerResponse, body: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function handleNotifyRequest(context: ApiContext, req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', `http://127.0.0.1:${rudderPort()}/`);
  if (req.method === 'POST' && url.pathname === '/notify') {
    scheduleTagging(context);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    sendJson(res, statsForDay(url.searchParams.get('day') || localDay()));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

export function startNotifyServer(context: ApiContext): void {
  if (notifyServer) return;
  notifyServer = http.createServer((req, res) => handleNotifyRequest(context, req, res));
  notifyServer.on('error', (err: NodeJS.ErrnoException) => {
    const message = `rudder: notify server unavailable (${err.code ?? err.message}); live refresh disabled.\n`;
    process.stderr.write(message);
    notifyServer = null;
  });
  notifyServer.listen(rudderPort(), '127.0.0.1');
}

export function registerIpc(context: ApiContext): void {
  // IPC is Electron's typed bridge between the isolated renderer and main process.
  ipcMain.handle('rudder:get-stats', (_event, day?: string) => statsForDay(day || localDay()));
  ipcMain.handle('rudder:generate-digest', (_event, options?: GenerateDigestRequest) =>
    generateDigest(options ?? {})
  );
  ipcMain.handle('rudder:install-hooks', () => installHooks(context.hookArgv));
  ipcMain.handle('rudder:get-hook-status', () => hookStatus(context.hookArgv));
  ipcMain.handle('rudder:get-settings', () => currentSettings(context));
  ipcMain.handle('rudder:set-agent-path', (_event, path?: string) => {
    setAgentPath(path);
    resetAgentPathCache();
    return currentSettings(context);
  });
  ipcMain.handle('rudder:open-external', (_event, url: string) => shell.openExternal(url));
}

export function scheduleInitialTagging(context: ApiContext): void {
  setTimeout(() => tagAndBroadcast(context), PROMPT_NOTIFY_DEBOUNCE_MS);
}
