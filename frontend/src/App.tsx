import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  createRule,
  deleteRule,
  fetchRules,
  setRuleEnforced,
  subscribeRules,
  updateRule,
} from './api';
import { DeleteModal } from './components/DeleteModal';
import { PendingCard } from './components/PendingCard';
import { RuleCard } from './components/RuleCard';
import { RuleModal } from './components/RuleModal';
import { Sidebar } from './components/Sidebar';
import type { ActiveRule, RuleFormInput, RuleState } from './types';

type Tab = 'pending' | 'active';

const initialState: RuleState = {
  active_rules: [],
  pending_prompts: 0,
  pending_rules: [],
};

function isUnchanged(rule: ActiveRule, input: RuleFormInput): boolean {
  return (
    rule.rule_text === input.ruleText.trim() &&
    rule.applies_when === input.appliesWhen.trim() &&
    rule.does_not_apply_when === input.doesNotApplyWhen.trim() &&
    rule.enforced === input.enforced
  );
}

function LiveBadge({ live }: { live: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
      <span
        className={[
          'h-2 w-2 rounded-full',
          live ? 'animate-pulse bg-[#3fb950]' : 'bg-[#8b949e]',
        ].join(' ')}
      />
      <span>{live ? 'live' : 'reconnecting...'}</span>
    </div>
  );
}

function InstallPage() {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const toDashboard = () => {
      if (standalone.matches) window.location.replace('/');
    };
    const beforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => setInstalled(true);

    toDashboard();
    standalone.addEventListener?.('change', toDashboard);
    window.addEventListener('pageshow', toDashboard);
    window.addEventListener('beforeinstallprompt', beforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    [200, 600, 1200].forEach((delay) => setTimeout(toDashboard, delay));

    return () => {
      standalone.removeEventListener?.('change', toDashboard);
      window.removeEventListener('pageshow', toDashboard);
      window.removeEventListener('beforeinstallprompt', beforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <section className="w-[360px] max-w-[90vw] text-center">
        <img className="mx-auto h-[84px] w-[84px] rounded-[20px]" src="/icon.svg" alt="rudder" />
        <h1 className="mt-4 text-[22px] font-semibold">Install rudder</h1>
        <p className="mt-1 mb-5 text-[#8b949e]">Your learned coding rules, updated as you work.</p>
        <button
          type="button"
          disabled={!installPrompt || installed}
          onClick={async () => {
            const prompt = installPrompt as Event & {
              prompt?: () => Promise<void>;
              userChoice?: Promise<{ outcome: string }>;
            };
            await prompt.prompt?.();
            const choice = await prompt.userChoice;
            if (choice?.outcome === 'accepted') setInstallPrompt(null);
          }}
          className="w-full rounded-lg bg-[#58a6ff] px-5 py-2.5 font-semibold text-[#06131f] disabled:bg-[#232a33] disabled:text-[#8b949e]"
        >
          {installed ? 'Installed' : installPrompt ? 'Install app' : "Use your browser's Install menu"}
        </button>
        <div className="mt-3 min-h-5 text-[13px] text-[#58a6ff]">
          {installed ? 'Open rudder from your dock (the daemon stays running here).' : ''}
        </div>
        <div className="mt-4 text-xs leading-relaxed text-[#8b949e]">
          On <b>Safari</b>, use <code>File &gt; Add to Dock</code>.
          <br />
          Already installed? Open <b>rudder</b> from your dock, or run <code>rudder start</code>{' '}
          again.
          <br />
          <a className="text-[#58a6ff]" href="/">
            Or view in this browser
          </a>
        </div>
      </section>
    </main>
  );
}

function Dashboard() {
  const [state, setState] = useState<RuleState>(initialState);
  const [live, setLive] = useState(true);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [editingRule, setEditingRule] = useState<ActiveRule | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: Tab = location.pathname === '/active' ? 'active' : 'pending';

  useEffect(() => {
    void fetchRules().then(setState).catch(() => setLive(false));
    const source = subscribeRules(
      (next) => {
        setState(next);
        setLive(true);
      },
      () => setLive(false)
    );
    return () => source.close();
  }, []);

  const pendingCount = state.pending_prompts || state.pending_rules.length;
  const summary = useMemo(() => {
    if (activeTab === 'active') {
      return (
        <>
          <b className="text-[#e6edf3]">{state.active_rules.length}</b> active rule
          {state.active_rules.length === 1 ? '' : 's'}
        </>
      );
    }
    return (
      <>
        <b className="text-[#e6edf3]">{pendingCount}</b> pending prompt
        {pendingCount === 1 ? '' : 's'}
      </>
    );
  }, [activeTab, pendingCount, state.active_rules.length]);

  async function saveRule(input: RuleFormInput) {
    // Skip the write entirely when nothing actually changed, so editing without
    // modifying a rule doesn't spawn a new (identical) version.
    if (editingRule && isUnchanged(editingRule, input)) {
      navigate('/active');
      setRuleModalOpen(false);
      setEditingRule(null);
      return;
    }
    const next = editingRule ? await updateRule(editingRule.id, input) : await createRule(input);
    setState(next);
    navigate('/active');
    setRuleModalOpen(false);
    setEditingRule(null);
  }

  return (
    <div className="mx-auto max-w-[840px] px-4 py-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-base font-semibold tracking-[.3px]">rudder</h1>
        <LiveBadge live={live} />
      </header>

      <div className="grid grid-cols-[164px_minmax(0,1fr)] items-start gap-3.5 max-sm:grid-cols-1">
        <Sidebar
          activeTab={activeTab}
          activeCount={state.active_rules.length}
          pendingCount={pendingCount}
        />
        <main className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[#8b949e]">{summary}</div>
            {activeTab === 'active' ? (
              <button
                type="button"
                aria-label="Add rule"
                onClick={() => {
                  setEditingRule(null);
                  setRuleModalOpen(true);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#232a33] bg-[#161b22] text-lg leading-none text-[#58a6ff]"
              >
                +
              </button>
            ) : null}
          </div>

          {activeTab === 'pending' ? (
            state.pending_rules.length ? (
              state.pending_rules.map((item) => <PendingCard key={item.id} item={item} />)
            ) : (
              <div className="rounded-xl border border-[#232a33] bg-[#161b22] px-4 py-7 text-center text-[#8b949e]">
                {pendingCount ? 'Rule evidence is being compiled...' : 'No pending rules.'}
              </div>
            )
          ) : state.active_rules.length ? (
            state.active_rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                expanded={expandedRules.has(rule.atomic_id)}
                onToggleExpanded={() => {
                  setExpandedRules((current) => {
                    const next = new Set(current);
                    if (next.has(rule.atomic_id)) next.delete(rule.atomic_id);
                    else next.add(rule.atomic_id);
                    return next;
                  });
                }}
                onToggleEnforced={async (enforced) => {
                  const next = await setRuleEnforced(rule.id, enforced);
                  setState(next);
                }}
                onEdit={() => {
                  setEditingRule(rule);
                  setRuleModalOpen(true);
                }}
                onDelete={() => setDeletingRuleId(rule.id)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-[#232a33] bg-[#161b22] px-4 py-7 text-center text-[#8b949e]">
              No active rules yet.
            </div>
          )}
          <footer className="mt-5 text-center text-[11px] text-[#8b949e]">
            Generated locally from your coding sessions &bull; Updates as you work
          </footer>
        </main>
      </div>

      <RuleModal
        open={ruleModalOpen}
        rule={editingRule}
        onClose={() => {
          setRuleModalOpen(false);
          setEditingRule(null);
        }}
        onSave={saveRule}
      />
      <DeleteModal
        open={deletingRuleId !== null}
        onClose={() => setDeletingRuleId(null)}
        onConfirm={async () => {
          if (deletingRuleId === null) return;
          const next = await deleteRule(deletingRuleId);
          setState(next);
          setDeletingRuleId(null);
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/install" element={<InstallPage />} />
        <Route path="/pending" element={<Dashboard />} />
        <Route path="/active" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/pending" replace />} />
        <Route path="*" element={<Navigate to="/pending" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
