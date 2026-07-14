import { randomUUID } from 'node:crypto';
import { openDb, type PromptRow } from './db.ts';

export type RuleKind = 'preference' | 'pitfall' | 'friction';
export type RuleScope = 'global' | 'project';
export type RuleAction = 'NEW' | 'NOOP' | 'UPDATE' | 'SUPERSEDE';

export interface MemoryRule {
  id: number;
  atomic_id: string;
  version: number;
  status: 'active' | 'superseded';
  kind: RuleKind;
  scope: RuleScope;
  project: string | null;
  rule_text: string;
  applies_when: string;
  does_not_apply_when: string;
  source_prompt_id: number | null;
  supersedes_rule_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TraceEvent extends PromptRow {
  transcript_path: string | null;
  task_text: string | null;
  behavior_text: string | null;
  lease_until: string | null;
  claim_token: string | null;
  attempts: number;
}

export interface RuleCandidate {
  action: RuleAction;
  existingAtomicId: string | null;
  kind: RuleKind;
  scope: RuleScope;
  ruleText: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
}

export function queueTraceEvent(
  promptId: number,
  transcriptPath: string | null,
  taskText: string,
  behaviorText: string
): void {
  openDb()
    .prepare(
      `INSERT OR IGNORE INTO trace_events
       (prompt_id, transcript_path, task_text, behavior_text, status, ts)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .run(promptId, transcriptPath, taskText || null, behaviorText || null, new Date().toISOString());
}

export function pendingTraceEvents(): TraceEvent[] {
  const now = new Date().toISOString();
  return openDb()
    .prepare(
      `SELECT p.*, e.transcript_path, e.task_text, e.behavior_text,
              e.lease_until, e.claim_token, e.attempts
       FROM trace_events e
       JOIN prompts p ON p.id = e.prompt_id
       WHERE e.status = 'pending'
          OR (e.status = 'error' AND e.attempts < 3)
          OR (e.status = 'compiling' AND e.attempts < 3
              AND (e.lease_until IS NULL OR e.lease_until < ?))
       ORDER BY p.ts ASC`
    )
    .all(now) as unknown as TraceEvent[];
}

const TRACE_EVENT_LEASE_MS = 15 * 60 * 1_000;

export function claimTraceEvent(
  promptId: number,
  compiler: string,
  compilerVersion: number,
  leaseMs = TRACE_EVENT_LEASE_MS
): string | null {
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
  const claimToken = randomUUID();
  const result = openDb()
    .prepare(
      `UPDATE trace_events
       SET status = 'compiling', compiler = ?, compiler_version = ?,
           error = NULL, lease_until = ?, claim_token = ?
       WHERE prompt_id = ?
         AND (status = 'pending'
              OR (status = 'error' AND attempts < 3)
              OR (status = 'compiling' AND attempts < 3
                  AND (lease_until IS NULL OR lease_until < ?)))`
    )
    .run(compiler, compilerVersion, leaseUntil, claimToken, promptId, now) as { changes: number };
  return result.changes > 0 ? claimToken : null;
}

export function markTraceEvent(
  promptId: number,
  status: 'compiled' | 'skipped' | 'error',
  compiler: string,
  compilerVersion: number,
  error?: string,
  claimToken?: string
): void {
  const token = claimToken ?? null;
  openDb()
    .prepare(
      `UPDATE trace_events
       SET status = ?, compiler = ?, compiler_version = ?, error = ?,
           lease_until = NULL, claim_token = NULL,
           attempts = attempts + CASE WHEN ? = 'error' THEN 1 ELSE 0 END
       WHERE prompt_id = ?
         AND ((status = 'compiling' AND claim_token = ?)
              OR (? IS NULL AND (status = 'pending' OR (status = 'error' AND attempts < 3))))`
    )
    .run(status, compiler, compilerVersion, error ?? null, status, promptId, token, token);
}

export function activeRules(projectKey?: string | null): MemoryRule[] {
  return openDb()
    .prepare(
      `SELECT * FROM memory_rules
       WHERE status = 'active'
         AND (scope = 'global' OR (scope = 'project' AND project = ?))
       ORDER BY CASE kind WHEN 'pitfall' THEN 0 WHEN 'preference' THEN 1 ELSE 2 END,
                atomic_id ASC`
    )
    .all(projectKey ?? null) as unknown as MemoryRule[];
}

export function allActiveRules(): MemoryRule[] {
  return openDb()
    .prepare(`SELECT * FROM memory_rules WHERE status = 'active' ORDER BY atomic_id ASC`)
    .all() as unknown as MemoryRule[];
}

export function renderRuleContext(projectKey?: string | null, limit = 12): string {
  const active = activeRules(projectKey);
  const rules = active.slice(0, limit);
  if (active.length === 0) return '';
  return [
    '### Rudder learned rules',
    'Check each rule against this turn. Apply it only when its condition fits.',
    ...rules.map(
      (rule) =>
        `- [${rule.atomic_id}] ${rule.rule_text} ` +
        `(when: ${rule.applies_when}; except: ${rule.does_not_apply_when})`
    ),
    ...(active.length > rules.length
      ? [`(${active.length - rules.length} additional active rules were omitted from this turn.)`]
      : []),
  ].join('\n');
}

function activeRuleByAtomicId(
  atomicId: string,
  projectKey: string | null,
  db = openDb()
): MemoryRule | null {
  return (
    (db
      .prepare(
        `SELECT * FROM memory_rules
         WHERE atomic_id = ? AND status = 'active'
           AND (scope = 'global' OR (scope = 'project' AND project = ?))
         ORDER BY version DESC LIMIT 1`
      )
      .get(atomicId, projectKey) as unknown as MemoryRule | undefined) ?? null
  );
}

function applyCandidate(
  db: ReturnType<typeof openDb>,
  event: TraceEvent,
  candidate: RuleCandidate,
  index: number,
  expectedVersions?: ReadonlyMap<string, number>
): MemoryRule | null {
  const projectKey = event.cwd ?? event.project;
  const existing = candidate.existingAtomicId
    ? activeRuleByAtomicId(candidate.existingAtomicId, projectKey, db)
    : null;
  if (candidate.action !== 'NEW' && !existing) {
    throw new Error(`active rule '${candidate.existingAtomicId}' was not found`);
  }
  if (
    existing &&
    expectedVersions &&
    expectedVersions.get(existing.atomic_id) !== existing.version
  ) {
    throw new Error(`active rule '${existing.atomic_id}' changed during compilation`);
  }
  const now = new Date().toISOString();
  if (candidate.action === 'NOOP') {
    db.prepare(
      `INSERT OR IGNORE INTO rule_evidence (rule_id, prompt_id, action, ts)
       VALUES (?, ?, 'NOOP', ?)`
    ).run(existing!.id, event.id, now);
    return existing;
  }

  if (existing) {
    db.prepare(`UPDATE memory_rules SET status = 'superseded', updated_at = ? WHERE id = ?`)
      .run(now, existing.id);
  }

  const atomicId =
    candidate.action === 'UPDATE' ? existing!.atomic_id : `rule-${event.id}-${index + 1}`;
  const version = candidate.action === 'UPDATE' ? existing!.version + 1 : 1;
  const project = candidate.scope === 'project' ? projectKey : null;
  const inserted = db
    .prepare(
      `INSERT INTO memory_rules
       (atomic_id, version, status, kind, scope, project, rule_text,
        applies_when, does_not_apply_when, source_prompt_id,
        supersedes_rule_id, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      atomicId,
      version,
      candidate.kind,
      candidate.scope,
      project,
      candidate.ruleText,
      candidate.appliesWhen,
      candidate.doesNotApplyWhen,
      event.id,
      existing?.id ?? null,
      now,
      now
    );
  const ruleId = Number(inserted.lastInsertRowid);
  db.prepare(
    `INSERT INTO rule_evidence (rule_id, prompt_id, action, ts) VALUES (?, ?, ?, ?)`
  ).run(ruleId, event.id, candidate.action, now);
  return db.prepare('SELECT * FROM memory_rules WHERE id = ?').get(ruleId) as unknown as MemoryRule;
}

function processableTraceEvent(
  db: ReturnType<typeof openDb>,
  promptId: number,
  claimToken?: string
): boolean {
  const row = db
    .prepare('SELECT status, attempts, claim_token FROM trace_events WHERE prompt_id = ?')
    .get(promptId) as { status: string; attempts: number; claim_token: string | null } | undefined;
  if (!row) return false;
  if (row.status === 'compiling') return !!claimToken && row.claim_token === claimToken;
  return (
    !claimToken && (row.status === 'pending' || (row.status === 'error' && row.attempts < 3))
  );
}

function lastCandidatePerExistingTarget(
  candidates: RuleCandidate[]
): { candidate: RuleCandidate; index: number }[] {
  const seen = new Set<string>();
  const kept: { candidate: RuleCandidate; index: number }[] = [];
  for (let index = candidates.length - 1; index >= 0; index--) {
    const candidate = candidates[index];
    if (candidate.existingAtomicId) {
      if (seen.has(candidate.existingAtomicId)) continue;
      seen.add(candidate.existingAtomicId);
    }
    kept.push({ candidate, index });
  }
  return kept.reverse();
}

/** Apply every candidate and mark its trace event in one SQLite transaction. */
export function applyCompilation(
  event: TraceEvent,
  candidates: RuleCandidate[],
  expectedVersions: ReadonlyMap<string, number>,
  compiler: string,
  compilerVersion: number,
  claimToken?: string
): MemoryRule[] {
  const db = openDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!processableTraceEvent(db, event.id, claimToken)) {
      db.exec('COMMIT');
      return [];
    }
    const rules = lastCandidatePerExistingTarget(candidates)
      .map(({ candidate, index }) => applyCandidate(db, event, candidate, index, expectedVersions))
      .filter((rule): rule is MemoryRule => rule !== null);
    db.prepare(
      `UPDATE trace_events
       SET status = 'compiled', compiler = ?, compiler_version = ?, error = NULL,
           lease_until = NULL, claim_token = NULL
       WHERE prompt_id = ?`
    ).run(compiler, compilerVersion, event.id);
    db.exec('COMMIT');
    return rules;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Apply one candidate transactionally (used by direct callers and tests). */
export function applyRuleCandidate(
  event: TraceEvent,
  candidate: RuleCandidate,
  index: number
): MemoryRule | null {
  const db = openDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const rule = applyCandidate(db, event, candidate, index);
    db.exec('COMMIT');
    return rule;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
