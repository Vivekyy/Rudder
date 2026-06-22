'use client';

import { useEffect, useMemo, useState } from 'react';
import { rudderClient } from '../renderer/rudder-client.ts';
import type { DigestResult } from '../src/digest.ts';
import type { RudderSettings } from '../src/desktop-api.ts';
import type { HookStatus } from '../src/install.ts';
import type { DayStats } from '../src/tags.ts';

const CATS = [
  { key: 'architecting', name: 'Architecting', color: 'var(--arch)' },
  { key: 'tuning', name: 'Tuning', color: 'var(--tune)' },
  { key: 'bugfixing', name: 'Bugfixing', color: 'var(--bug)' },
  { key: 'housekeeping', name: 'Housekeeping', color: 'var(--house)' },
] as const;

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home() {
  const client = useMemo(() => rudderClient(), []);
  const [day, setDay] = useState(localDay());
  const [stats, setStats] = useState<DayStats | null>(null);
  const [settings, setSettings] = useState<RudderSettings | null>(null);
  const [hooks, setHooks] = useState<HookStatus | null>(null);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(selectedDay = day) {
    const [nextStats, nextSettings, nextHooks] = await Promise.all([
      client.getStats(selectedDay),
      client.getSettings(),
      client.getHookStatus(),
    ]);
    setStats(nextStats);
    setSettings(nextSettings);
    setHooks(nextHooks);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
    return client.onStatsUpdated((next) => {
      if (next.day === day) setStats(next);
    });
  }, [client, day]);

  async function installHooks() {
    setBusy(true);
    setError(null);
    try {
      await client.installHooks();
      setHooks(await client.getHookStatus());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setDigest(await client.generateDigest({ day }));
      setStats(await client.getStats(day));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const correction =
    stats?.correctionPct === null || stats?.correctionPct === undefined ? '-' : `${stats.correctionPct}%`;
  const hookSummary = hooks
    ? `${hooks.claude ? 'Claude installed' : 'Claude missing'} / ${hooks.codex ? 'Codex installed' : 'Codex missing'}`
    : 'Checking hooks';

  return (
    <main className="wrap">
      <header className="topbar">
        <div className="brand">
          <h1>Rudder</h1>
          <p>Local AI coding stats from Claude Code and Codex.</p>
        </div>
        <div className="live">
          <span className="dot" />
          <span>{stats ? 'live' : 'loading'}</span>
        </div>
      </header>

      <section className="grid">
        <div className="stack">
          <div className="card">
            <h2>Correction Rate</h2>
            <div className="correction">{correction}</div>
            <p className="muted">
              {stats?.correctionPct === null
                ? "You have not said yes or no yet today."
                : 'of the time, you said no to your AI'}
            </p>
            <div className="totals">
              <span>
                <b>{stats?.total ?? 0}</b> prompts
              </span>
              <span>
                <b>{stats?.counted ?? 0}</b> counted
              </span>
              <span>
                <b>{stats?.ignored ?? 0}</b> skipped
              </span>
            </div>
          </div>

          <div className="card">
            <h2>Where Your Prompts Went</h2>
            {CATS.map((cat) => {
              const stat = stats?.byCategory[cat.key] ?? { pct: 0, count: 0 };
              return (
                <div className="barRow" key={cat.key}>
                  <div className="barHead">
                    <span>{cat.name}</span>
                    <span className="muted">
                      <b>{stat.pct}%</b> · {stat.count}
                    </span>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${stat.pct}%`, background: cat.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <h2>Setup</h2>
            <div className="settingRow">
              <b>Hooks</b>
              <span className="settingValue">{hookSummary}</span>
            </div>
            <div className="settingRow">
              <b>Agent</b>
              <span className="settingValue">{settings?.agent ?? 'not found'}</span>
            </div>
            <div className="settingRow">
              <b>Database</b>
              <span className="settingValue">{settings?.dbPath ?? 'loading'}</span>
            </div>
            <button disabled={busy} onClick={installHooks}>
              Install or Repair Hooks
            </button>
          </div>

          <div className="card">
            <h2>Digest</h2>
            <div className="form">
              <label className="subtle" htmlFor="day">
                Date
              </label>
              <input id="day" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
              <button disabled={busy} onClick={generate}>
                Generate Digest
              </button>
              {digest ? <pre className="digest">{digest.markdown}</pre> : null}
            </div>
          </div>

          {error ? <div className="card error">{error}</div> : null}
        </aside>
      </section>
    </main>
  );
}
