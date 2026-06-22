import type { Agent, DigestResult } from './digest.ts';
import type { DayStats } from './tags.ts';
import type { HookStatus, InstallResult } from './install.ts';
import type { MigrationResult } from './db.ts';

export interface RudderSettings {
  dbPath: string;
  userDataPath: string;
  migration: MigrationResult;
  agent: Agent | null;
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
  onStatsUpdated(callback: (stats: DayStats) => void): () => void;
}

declare global {
  interface Window {
    rudder?: RudderDesktopApi;
  }
}
