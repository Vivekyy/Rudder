import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import {
  claudeHook,
  codexHook,
  configureRudderHome,
  electronHookArgv,
  openDb,
} from '../src/core.ts';
import { registerIpc, scheduleInitialTagging, startNotifyServer } from './api.ts';

const here = dirname(fileURLToPath(import.meta.url));

app.setName('Rudder');

let mainWindow: BrowserWindow | null = null;

function hookArgv(sub: string[]): string[] {
  const appEntryPath = process.defaultApp ? process.argv[1] : undefined;
  return electronHookArgv(process.execPath, sub, appEntryPath);
}

function configureDesktopStorage(): void {
  const userData = app.getPath('userData');
  configureRudderHome(userData);
  openDb();
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
  const context = {
    userDataPath: app.getPath('userData'),
    hookArgv,
    mainWindow: () => mainWindow,
  };
  registerIpc(context);
  startNotifyServer(context);
  await createWindow();
  scheduleInitialTagging(context);
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
  // Keep the app resident on macOS so dock re-activation can reopen the window.
  if (process.platform !== 'darwin') app.quit();
});
