import { contextBridge, ipcRenderer } from 'electron';
import type { DayStats } from '../src/tags.ts';
import type { GenerateDigestRequest, RudderDesktopApi } from '../src/api-contract.ts';

const api: RudderDesktopApi = {
  getStats: (day?: string) => ipcRenderer.invoke('rudder:get-stats', day),
  generateDigest: (options?: GenerateDigestRequest) =>
    ipcRenderer.invoke('rudder:generate-digest', options ?? {}),
  installHooks: () => ipcRenderer.invoke('rudder:install-hooks'),
  getHookStatus: () => ipcRenderer.invoke('rudder:get-hook-status'),
  getSettings: () => ipcRenderer.invoke('rudder:get-settings'),
  setAgentPath: (path?: string) => ipcRenderer.invoke('rudder:set-agent-path', path),
  onStatsUpdated: (callback: (stats: DayStats) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, stats: DayStats) => callback(stats);
    ipcRenderer.on('rudder:stats-updated', listener);
    return () => ipcRenderer.off('rudder:stats-updated', listener);
  },
};

contextBridge.exposeInMainWorld('rudder', api);
