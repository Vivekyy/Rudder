'use client';

import type { RudderDesktopApi, RudderSettings, GenerateDigestRequest } from '../src/desktop-api.ts';
import type { DigestResult } from '../src/digest.ts';
import type { HookStatus, InstallResult } from '../src/install.ts';
import type { DayStats } from '../src/tags.ts';

const today = new Date().toISOString().slice(0, 10);

const demoStats: DayStats = {
  day: today,
  total: 0,
  ignored: 0,
  counted: 0,
  byCategory: {
    architecting: { count: 0, pct: 0 },
    tuning: { count: 0, pct: 0 },
    bugfixing: { count: 0, pct: 0 },
    housekeeping: { count: 0, pct: 0 },
  },
  agree: 0,
  disagree: 0,
  correctionPct: null,
};

const webFallback = (): RudderDesktopApi => ({
  async getStats(day?: string) {
    try {
      const qs = day ? `?day=${encodeURIComponent(day)}` : '';
      const res = await fetch(`/api/stats${qs}`, { cache: 'no-store' });
      if (res.ok) return (await res.json()) as DayStats;
    } catch {
      // Vercel/static mode has no local bridge yet; show an empty dashboard.
    }
    return { ...demoStats, day: day || demoStats.day };
  },
  async generateDigest(_options?: GenerateDigestRequest): Promise<DigestResult> {
    throw new Error('Digest generation is available in the Rudder desktop app.');
  },
  async installHooks(): Promise<InstallResult> {
    throw new Error('Hook installation is available in the Rudder desktop app.');
  },
  async getHookStatus(): Promise<HookStatus> {
    return { claude: false, codex: false, claudePath: '~/.claude/settings.json', codexPath: '~/.codex/config.toml' };
  },
  async getSettings(): Promise<RudderSettings> {
    return {
      dbPath: 'local desktop app only',
      userDataPath: 'local desktop app only',
      migration: { migrated: false, from: '', to: '', reason: 'web-renderer' },
      agent: null,
    };
  },
  onStatsUpdated() {
    return () => {};
  },
});

export function rudderClient(): RudderDesktopApi {
  if (typeof window !== 'undefined' && window.rudder) return window.rudder;
  return webFallback();
}
