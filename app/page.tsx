'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { rudderClient } from '../renderer/rudder-client.ts';
import type { SetupStatus } from '../src/api-contract.ts';
import type { DigestResult } from '../src/digest.ts';
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
  const client = useMemo(() => {
    try {
      return rudderClient();
    } catch {
      return null;
    }
  }, []);
  const [day, setDay] = useState(localDay());
  const [stats, setStats] = useState<DayStats | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (selectedDay = day) => {
      if (!client)
        throw new Error('Rudder desktop bridge is unavailable. Open this UI from the desktop app.');
      const nextSetupStatus = await client.getSetupStatus();
      setSetupStatus(nextSetupStatus);
      setStats(await client.getStats(selectedDay));
    },
    [client, day]
  );

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
    if (!client) return;
    return client.onStatsUpdated((next) => {
      if (next.day === day) setStats(next);
    });
  }, [client, day, refresh]);

  async function generate() {
    if (!client) return;
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
    stats?.correctionPct === null || stats?.correctionPct === undefined
      ? '-'
      : `${stats.correctionPct}%`;
  const status = setupStatus && !setupStatus.complete ? 'setup needed' : stats ? 'live' : 'loading';

  return (
    <main className="wrap">
      <header className="topbar">
        <div className="brand">
          <h1>Rudder</h1>
        </div>
        <div className="status">
          <span className={status === 'setup needed' ? 'dot warnDot' : 'dot'} />
          <span>{status}</span>
        </div>
      </header>

      <section className="grid">
        <div className="stack">
          <div className="card">
            <h2>Correction Rate</h2>
            <div className="correction">{correction}</div>
            <p className="muted">
              {stats?.correctionPct === null
                ? 'You have not said yes or no yet today.'
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
                    <div
                      className="fill"
                      style={{ width: `${stat.pct}%`, background: cat.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <h2>Digest</h2>
            <div className="form">
              <label className="subtle" htmlFor="day">
                Date
              </label>
              <input
                id="day"
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
              <button disabled={busy} onClick={generate} type="button">
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
