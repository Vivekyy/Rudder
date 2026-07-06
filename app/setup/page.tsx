'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { rudderClient } from '../../renderer/rudder-client.ts';
import type { SetupStatus } from '../../src/api-contract.ts';

export default function Setup() {
  const client = useMemo(() => {
    try {
      return rudderClient();
    } catch {
      return null;
    }
  }, []);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [agentPath, setAgentPath] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client)
      throw new Error('Rudder desktop bridge is unavailable. Open this UI from the desktop app.');
    const nextStatus = await client.getSetupStatus();
    setStatus(nextStatus);
    setAgentPath(nextStatus.settings.agentPath ?? '');
  }, [client]);

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  async function installHooks() {
    if (!client) return;
    setSetupBusy(true);
    setError(null);
    try {
      await client.installHooks();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSetupBusy(false);
    }
  }

  async function saveAgentPath() {
    if (!client) return;
    setSetupBusy(true);
    setError(null);
    try {
      await client.setAgentPath(agentPath);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSetupBusy(false);
    }
  }

  async function openDashboard() {
    if (!client) return;
    setError(null);
    try {
      await client.showDashboard();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const hookSummary = status
    ? `${status.hooks.claude ? 'Claude installed' : 'Claude missing'} / ${status.hooks.codex ? 'Codex installed' : 'Codex missing'}`
    : 'Checking hooks';
  const agentSummary = status?.settings.agent ?? 'not found';

  return (
    <main className="wrap setupWrap">
      <header className="topbar">
        <div className="brand">
          <h1>Setup</h1>
          <p>Connect Rudder to Claude Code and Codex before tracking prompts.</p>
        </div>
        <div className="live">
          <span className={status?.complete ? 'dot' : 'dot warnDot'} />
          <span>{status?.complete ? 'ready' : 'setup needed'}</span>
        </div>
      </header>

      <section className="card setupCard">
        <h2>Rudder Setup</h2>
        <p className="muted">
          Rudder needs capture hooks installed and a Claude or Codex executable available for
          tagging and digest generation.
        </p>

        <div className="settingRow">
          <b>Status</b>
          <span className="settingValue">{status?.complete ? 'Complete' : 'Incomplete'}</span>
        </div>
        <div className="settingRow">
          <b>Hooks</b>
          <span className="settingValue">{hookSummary}</span>
        </div>
        <div className="settingRow">
          <b>Agent</b>
          <span className="settingValue">{agentSummary}</span>
        </div>

        <div className="form">
          <label className="subtle" htmlFor="agentPath">
            Claude or Codex executable path
          </label>
          <input
            id="agentPath"
            placeholder="/opt/homebrew/bin/claude"
            value={agentPath}
            onChange={(event) => setAgentPath(event.target.value)}
          />
          <button disabled={setupBusy} onClick={saveAgentPath} type="button">
            Save Agent Path
          </button>
        </div>

        <div className="settingRow">
          <b>Database</b>
          <span className="settingValue">{status?.settings.dbPath ?? 'loading'}</span>
        </div>

        <div className="actions setupActions">
          <button disabled={setupBusy} onClick={installHooks} type="button">
            Install or Repair Hooks
          </button>
          <button className="secondary" onClick={openDashboard} type="button">
            Open Dashboard
          </button>
        </div>
      </section>

      {error ? <div className="card error">{error}</div> : null}
    </main>
  );
}
