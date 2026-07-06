import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { configureRudderHome, openDb } from '../src/db.ts';
import { claudeHook, codexHook } from '../src/hooks.ts';
import { electronHookArgv } from '../src/install.ts';
import {
  type ApiContext,
  type RudderRoute,
  registerIpc,
  scheduleInitialTagging,
  setupStatus,
  startNotifyServer,
} from './api.ts';

const here = dirname(fileURLToPath(import.meta.url));

app.setName('Rudder');

let mainWindow: BrowserWindow | null = null;
let appContext: ApiContext | null = null;

function hookArgv(sub: string[]): string[] {
  const appEntryPath = process.defaultApp ? process.argv[1] : undefined;
  return electronHookArgv(process.execPath, sub, appEntryPath);
}

function configureDesktopStorage(): void {
  const userData = app.getPath('userData');
  configureRudderHome(userData);
  openDb();
}

function rendererFile(route: RudderRoute): string {
  const outCandidates = [
    join(app.getAppPath(), 'out'),
    join(process.cwd(), 'out'),
    join(here, '..', 'out'),
  ];
  const candidates =
    route === 'setup'
      ? outCandidates.flatMap((outDir) => [
          join(outDir, 'setup.html'),
          join(outDir, 'setup', 'index.html'),
        ])
      : outCandidates.map((outDir) => join(outDir, 'index.html'));
  const hit = candidates.find((path) => existsSync(path));
  if (!hit) throw new Error('Next.js renderer has not been built. Run `npm run build:renderer`.');
  return hit;
}

async function loadRoute(window: BrowserWindow, route: RudderRoute): Promise<void> {
  const devUrl = process.env.RUDDER_RENDERER_URL;
  if (devUrl) {
    const url = new URL(route === 'setup' ? '/setup' : '/', devUrl);
    await window.loadURL(url.toString());
    return;
  }
  await window.loadFile(rendererFile(route));
}

async function showRoute(route: RudderRoute): Promise<void> {
  if (!mainWindow) {
    await createWindow(route);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  await loadRoute(mainWindow, route);
}

async function createWindow(route: RudderRoute): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    title: 'Rudder',
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await loadRoute(mainWindow, route);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startupRoute(context: ApiContext): RudderRoute {
  return setupStatus(context).complete ? 'dashboard' : 'setup';
}

function configureApplicationMenu(): void {
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Dashboard',
      accelerator: 'CmdOrCtrl+1',
      click: () => {
        void showRoute('dashboard');
      },
    },
    {
      label: 'Setup',
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        void showRoute('setup');
      },
    },
    { type: 'separator' },
    process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
  ];

  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    });
  }
  template.push({ label: 'File', submenu: fileSubmenu }, { role: 'viewMenu' });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
    navigate: showRoute,
  };
  appContext = context;
  registerIpc(context);
  startNotifyServer(context);
  configureApplicationMenu();
  await createWindow(startupRoute(context));
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
  if (BrowserWindow.getAllWindows().length === 0 && appContext) {
    void createWindow(startupRoute(appContext));
  }
});

app.on('window-all-closed', () => {
  // Keep the app resident on macOS so dock re-activation can reopen the window.
  if (process.platform !== 'darwin') app.quit();
});
