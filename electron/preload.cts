import electron = require('electron');

import type { GenerateDigestRequest, RudderDesktopApi } from '../src/api-contract.ts';
import type { DayStats } from '../src/tags.ts';

const { contextBridge, ipcRenderer } = electron;

const api: RudderDesktopApi = {
  getStats: (day?: string) => ipcRenderer.invoke('rudder:get-stats', day),
  generateDigest: (options?: GenerateDigestRequest) =>
    ipcRenderer.invoke('rudder:generate-digest', options ?? {}),
  installHooks: () => ipcRenderer.invoke('rudder:install-hooks'),
  getHookStatus: () => ipcRenderer.invoke('rudder:get-hook-status'),
  getSettings: () => ipcRenderer.invoke('rudder:get-settings'),
  getSetupStatus: () => ipcRenderer.invoke('rudder:get-setup-status'),
  setAgentPath: (path?: string) => ipcRenderer.invoke('rudder:set-agent-path', path),
  showDashboard: () => ipcRenderer.invoke('rudder:show-dashboard'),
  showSetup: () => ipcRenderer.invoke('rudder:show-setup'),
  onStatsUpdated: (callback: (stats: DayStats) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, stats: DayStats) => callback(stats);
    ipcRenderer.on('rudder:stats-updated', listener);
    return () => ipcRenderer.off('rudder:stats-updated', listener);
  },
};

contextBridge.exposeInMainWorld('rudder', api);
