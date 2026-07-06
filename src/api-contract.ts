import type { Agent, DigestResult } from './digest.ts';
import type { HookStatus, InstallResult } from './install.ts';
import type { DayStats } from './tags.ts';

export interface RudderSettings {
  dbPath: string;
  userDataPath: string;
  agent: Agent | null;
  agentPath: string | null;
}

export interface SetupStatus {
  complete: boolean;
  hooks: HookStatus;
  settings: RudderSettings;
}

export interface GenerateDigestRequest {
  day?: string;
  agent?: Agent;
  out?: string;
}

export interface RudderDesktopApi {
  getStats(day?: string): Promise<DayStats>;
  generateDigest(options?: GenerateDigestRequest): Promise<DigestResult>;
  installHooks(): Promise<InstallResult>;
  getHookStatus(): Promise<HookStatus>;
  getSettings(): Promise<RudderSettings>;
  getSetupStatus(): Promise<SetupStatus>;
  setAgentPath(path?: string): Promise<RudderSettings>;
  showDashboard(): Promise<void>;
  showSetup(): Promise<void>;
  onStatsUpdated(callback: (stats: DayStats) => void): () => void;
}

declare global {
  interface Window {
    rudder?: RudderDesktopApi;
  }
}
