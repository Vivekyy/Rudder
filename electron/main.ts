import http from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import {
  claudeHook,
  codexHook,
  configureRudderHome,
  dbPath,
  electronHookArgv,
  ensureTagged,
  generateDigest,
  hookStatus,
  installHooks,
  localDay,
  migrateLegacyDb,
  openDb,
  resolveAgent,
  rudderPort,
  statsForDay,
  type Agent,
  type MigrationResult,
} from '../src/core.ts';
import type { GenerateDigestRequest, RudderSettings } from '../src/desktop-api.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DEBOUNCE_MS = 1500;

app.setName('Rudder');

let mainWindow: BrowserWindow | null = null;
let migration: MigrationResult | null = null;
let notifyServer: http.Server | null = null;
let debounce: NodeJS.Timeout | null = null;
let tagging = false;
let pending = false;

function hookArgv(sub: string[]): string[] {
  const appEntryPath = process.defaultApp ? process.argv[1] : undefined;
  return electronHookArgv(process.execPath, sub, appEntryPath);
}

function configureDesktopStorage(): void {
  const userData = app.getPath('userData');
  configureRudderHome(userData);
  migration ??= migrateLegacyDb(userData);
  openDb();
}

function currentAgent(): Agent | null {
  try {
    return resolveAgent();
  } catch {
    return null;
  }
}

function currentSettings(): RudderSettings {
  return {
    dbPath: dbPath(),
    userDataPath: app.getPath('userData'),
    migration: migration ?? {
      migrated: false,
      from: '',
      to: dbPath(),
      reason: 'not-checked',
    },
    agent: currentAgent(),
  };
}

function broadcastToday(): void {
  const stats = statsForDay(localDay());
  mainWindow?.webContents.send('rudder:stats-updated', stats);
}

function tagAndBroadcast(): void {
  if (tagging) {
    pending = true;
    return;
  }
  tagging = true;
  try {
    ensureTagged(localDay());
  } finally {
    tagging = false;
    broadcastToday();
    if (pending) {
      pending = false;
      tagAndBroadcast();
    }
  }
}

function scheduleTagging(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    tagAndBroadcast();
  }, DEBOUNCE_MS);
}

function startNotifyServer(): void {
  if (notifyServer) return;
  notifyServer = http.createServer((req, res) => {
    const { pathname } = new URL(req.url || '/', `http://127.0.0.1:${rudderPort()}/`);
    if (req.method === 'POST' && pathname === '/notify') {
      scheduleTagging();
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && pathname === '/api/stats') {
      const day = new URL(req.url || '/', `http://127.0.0.1:${rudderPort()}/`).searchParams.get('day') || localDay();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(statsForDay(day)));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  notifyServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') throw err;
    notifyServer = null;
  });
  notifyServer.listen(rudderPort(), '127.0.0.1');
}

function rendererFile(): string {
  const candidates = [
    join(app.getAppPath(), 'out', 'index.html'),
    join(process.cwd(), 'out', 'index.html'),
    join(here, '..', 'out', 'index.html'),
  ];
  const hit = candidates.find((path) => existsSync(path));
  if (!hit) throw new Error('Next.js renderer has not been built. Run `npm run build:renderer`.');
  return hit;
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    title: 'Rudder',
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: join(here, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.RUDDER_RENDERER_URL;
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(rendererFile());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('rudder:get-stats', (_event, day?: string) => statsForDay(day || localDay()));
  ipcMain.handle('rudder:generate-digest', (_event, options?: GenerateDigestRequest) =>
    generateDigest(options ?? {})
  );
  ipcMain.handle('rudder:install-hooks', () => installHooks(hookArgv));
  ipcMain.handle('rudder:get-hook-status', () => hookStatus(hookArgv));
  ipcMain.handle('rudder:get-settings', () => currentSettings());
  ipcMain.handle('rudder:open-external', (_event, url: string) => shell.openExternal(url));
}

async function runHookMode(which: string | undefined, rest: string[]): Promise<void> {
  configureDesktopStorage();
  try {
    if (which === 'claude') await claudeHook();
    else if (which === 'codex') await codexHook(rest);
    else process.stderr.write("rudder: hook requires 'claude' or 'codex'\n");
  } catch (err) {
    process.stderr.write(`rudder hook error (ignored): ${(err as Error).message}\n`);
  } finally {
    app.exit(0);
  }
}

async function runApp(): Promise<void> {
  configureDesktopStorage();
  registerIpc();
  startNotifyServer();
  await createWindow();
  setTimeout(() => tagAndBroadcast(), 1500);
}

const hookIndex = process.argv.indexOf('--rudder-hook');

app.whenReady().then(async () => {
  if (hookIndex !== -1) {
    await runHookMode(process.argv[hookIndex + 1], process.argv.slice(hookIndex + 2));
    return;
  }
  await runApp();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
