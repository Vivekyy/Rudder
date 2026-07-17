import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  memoryRules,
  prompts,
  rudderDb,
  ruleEvidence,
  traceEvents,
  traceVerifications,
  type PromptRow,
} from './db/index.ts';

export type MemoryRule = typeof memoryRules.$inferSelect;
export type RuleKind = MemoryRule['kind'];
export type RuleScope = MemoryRule['scope'];
export type RuleAction = 'NEW' | 'NOOP' | 'UPDATE';

export interface TraceEvent extends PromptRow {
  turn_id: string | null;
  hook_prompt_id: string | null;
  transcript_path: string | null;
  task_text: string | null;
  behavior_text: string | null;
  applicable_atomic_ids: string | null;
  applicability_reason: string | null;
  applicability_agent: string | null;
  applicability_version: number | null;
  applicability_ts: string | null;
  lease_until: string | null;
  claim_token: string | null;
  attempts: number;
}

export interface TraceApplicability {
  applicableAtomicIds: string[];
  reason: string;
  agent: string;
  version: number;
  ts: string;
}

export interface TraceVerification {
  promptId: number;
  attempt: number;
  enforced: boolean;
  reason: string;
  verdicts: unknown[];
  blocked: boolean;
  verifier: string;
  verifierVersion: number;
  ts: string;
}

export interface RuleCandidate {
  action: RuleAction;
  existingAtomicId: string | null;
  kind: RuleKind;
  scope: RuleScope;
  enforced: boolean;
  ruleText: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
}

export interface TraceEventLookup {
  source: PromptRow['source'];
  sessionId?: string | null;
  turnId?: string | null;
  hookPromptId?: string | null;
  cwd?: string | null;
}

function normalizeProjectKey(projectKey?: string | null): string | null {
  if (!projectKey) return null;
  return basename(projectKey) || projectKey;
}

function projectKeyForEvent(event: TraceEvent): string | null {
  return event.project ?? normalizeProjectKey(event.cwd);
}

export function queueTraceEvent(
  promptId: number,
  transcriptPath: string | null,
  taskText: string,
  behaviorText: string,
  metadata: { turnId?: string | null; hookPromptId?: string | null } = {}
): void {
  rudderDb()
    .insert(traceEvents)
    .values({
      prompt_id: promptId,
      turn_id: metadata.turnId ?? null,
      hook_prompt_id: metadata.hookPromptId ?? null,
      transcript_path: transcriptPath,
      task_text: taskText || null,
      behavior_text: behaviorText || null,
      status: 'pending',
      ts: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

const traceEventSelection = {
  id: prompts.id,
  ts: prompts.ts,
  day: prompts.day,
  source: prompts.source,
  session_id: prompts.session_id,
  cwd: prompts.cwd,
  project: prompts.project,
  prompt: prompts.prompt,
  model: prompts.model,
  raw: prompts.raw,
  turn_id: traceEvents.turn_id,
  hook_prompt_id: traceEvents.hook_prompt_id,
  transcript_path: traceEvents.transcript_path,
  task_text: traceEvents.task_text,
  behavior_text: traceEvents.behavior_text,
  applicable_atomic_ids: traceEvents.applicable_atomic_ids,
  applicability_reason: traceEvents.applicability_reason,
  applicability_agent: traceEvents.applicability_agent,
  applicability_version: traceEvents.applicability_version,
  applicability_ts: traceEvents.applicability_ts,
  lease_until: traceEvents.lease_until,
  claim_token: traceEvents.claim_token,
  attempts: traceEvents.attempts,
};

export function pendingTraceEvents(): TraceEvent[] {
  const now = new Date().toISOString();
  return rudderDb()
    .select(traceEventSelection)
    .from(traceEvents)
    .innerJoin(prompts, eq(prompts.id, traceEvents.prompt_id))
    .where(
      or(
        eq(traceEvents.status, 'pending'),
        and(eq(traceEvents.status, 'error'), lt(traceEvents.attempts, 3)),
        and(
          eq(traceEvents.status, 'compiling'),
          lt(traceEvents.attempts, 3),
          or(isNull(traceEvents.lease_until), lt(traceEvents.lease_until, now))
        )
      )
    )
    .orderBy(asc(prompts.ts))
    .all() as TraceEvent[];
}

function latestTraceEventWhere(clauses: any[]): TraceEvent | null {
  return (
    (rudderDb()
      .select(traceEventSelection)
      .from(traceEvents)
      .innerJoin(prompts, eq(prompts.id, traceEvents.prompt_id))
      .where(and(...clauses))
      .orderBy(desc(prompts.ts))
      .limit(1)
      .get() as TraceEvent | undefined) ?? null
  );
}

export function findTraceEventForHook(lookup: TraceEventLookup): TraceEvent | null {
  const base = [eq(prompts.source, lookup.source)];
  if (lookup.turnId) {
    const byTurn = latestTraceEventWhere([...base, eq(traceEvents.turn_id, lookup.turnId)]);
    if (byTurn) return byTurn;
  }
  if (lookup.hookPromptId) {
    const byPrompt = latestTraceEventWhere([
      ...base,
      eq(traceEvents.hook_prompt_id, lookup.hookPromptId),
    ]);
    if (byPrompt) return byPrompt;
  }
  if (lookup.sessionId) {
    const bySession = latestTraceEventWhere([
      ...base,
      eq(prompts.session_id, lookup.sessionId),
      ...(lookup.cwd ? [eq(prompts.cwd, lookup.cwd)] : []),
    ]);
    if (bySession) return bySession;
  }
  if (lookup.cwd) return latestTraceEventWhere([...base, eq(prompts.cwd, lookup.cwd)]);
  return latestTraceEventWhere(base);
}

function parseAtomicIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function traceApplicability(event: TraceEvent): TraceApplicability | null {
  if (!event.applicability_agent || event.applicability_version === null || !event.applicability_ts) {
    return null;
  }
  return {
    applicableAtomicIds: parseAtomicIds(event.applicable_atomic_ids),
    reason: event.applicability_reason ?? '',
    agent: event.applicability_agent,
    version: event.applicability_version,
    ts: event.applicability_ts,
  };
}

export function markTraceApplicability(
  promptId: number,
  applicableAtomicIds: readonly string[],
  reason: string,
  agent: string,
  version: number
): void {
  rudderDb()
    .update(traceEvents)
    .set({
      applicable_atomic_ids: JSON.stringify([...new Set(applicableAtomicIds)]),
      applicability_reason: reason.slice(0, 2_000),
      applicability_agent: agent,
      applicability_version: version,
      applicability_ts: new Date().toISOString(),
    })
    .where(eq(traceEvents.prompt_id, promptId))
    .run();
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
  const result = rudderDb()
    .update(traceEvents)
    .set({
      status: 'compiling',
      compiler,
      compiler_version: compilerVersion,
      error: null,
      lease_until: leaseUntil,
      claim_token: claimToken,
    })
    .where(
      and(
        eq(traceEvents.prompt_id, promptId),
        or(
          eq(traceEvents.status, 'pending'),
          and(eq(traceEvents.status, 'error'), lt(traceEvents.attempts, 3)),
          and(
            eq(traceEvents.status, 'compiling'),
            lt(traceEvents.attempts, 3),
            or(isNull(traceEvents.lease_until), lt(traceEvents.lease_until, now))
          )
        )
      )
    )
    .run() as { changes: number | bigint };
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
  const ownerClause =
    token === null
      ? or(eq(traceEvents.status, 'pending'), and(eq(traceEvents.status, 'error'), lt(traceEvents.attempts, 3)))
      : and(eq(traceEvents.status, 'compiling'), eq(traceEvents.claim_token, token));
  rudderDb()
    .update(traceEvents)
    .set({
      status,
      compiler,
      compiler_version: compilerVersion,
      error: error ?? null,
      lease_until: null,
      claim_token: null,
      attempts: sql<number>`${traceEvents.attempts} + CASE WHEN ${status} = 'error' THEN 1 ELSE 0 END`,
    })
    .where(and(eq(traceEvents.prompt_id, promptId), ownerClause))
    .run();
}

export function activeRules(projectKey?: string | null): MemoryRule[] {
  const normalizedProject = normalizeProjectKey(projectKey);
  const projectClause = normalizedProject
    ? or(
        eq(memoryRules.scope, 'global'),
        and(eq(memoryRules.scope, 'project'), eq(memoryRules.project, normalizedProject))
      )
    : eq(memoryRules.scope, 'global');
  return rudderDb()
    .select()
    .from(memoryRules)
    .where(and(eq(memoryRules.status, 'active'), projectClause))
    .orderBy(
      sql`CASE ${memoryRules.kind} WHEN 'pitfall' THEN 0 ELSE 1 END`,
      asc(memoryRules.atomic_id)
    )
    .all() as MemoryRule[];
}

export function allActiveRules(): MemoryRule[] {
  return rudderDb()
    .select()
    .from(memoryRules)
    .where(eq(memoryRules.status, 'active'))
    .orderBy(asc(memoryRules.atomic_id))
    .all() as MemoryRule[];
}

function activeRuleById(id: number, db: RuleDb = rudderDb()): MemoryRule | null {
  return (
    (db
      .select()
      .from(memoryRules)
      .where(and(eq(memoryRules.id, id), eq(memoryRules.status, 'active')))
      .get() as MemoryRule | undefined) ?? null
  );
}

function requiredRuleText(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed.slice(0, max);
}

export interface ManualRuleInput {
  ruleText: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
  enforced: boolean;
}

function normalizeManualRuleInput(input: Partial<ManualRuleInput>): ManualRuleInput {
  return {
    ruleText: requiredRuleText(input.ruleText, 'ruleText'),
    appliesWhen: requiredRuleText(input.appliesWhen, 'appliesWhen'),
    doesNotApplyWhen: requiredRuleText(input.doesNotApplyWhen, 'doesNotApplyWhen'),
    enforced: input.enforced === true,
  };
}

export function createManualRule(input: Partial<ManualRuleInput>): MemoryRule {
  const rule = normalizeManualRuleInput(input);
  const now = new Date().toISOString();
  const inserted = rudderDb()
    .insert(memoryRules)
    .values({
      atomic_id: `rule_${randomUUID()}`,
      version: 1,
      status: 'active',
      kind: 'preference',
      scope: 'global',
      enforced: rule.enforced,
      project: null,
      rule_text: rule.ruleText,
      applies_when: rule.appliesWhen,
      does_not_apply_when: rule.doesNotApplyWhen,
      source_prompt_id: null,
      created_at: now,
      updated_at: now,
    })
    .run();
  return rudderDb()
    .select()
    .from(memoryRules)
    .where(eq(memoryRules.id, Number(inserted.lastInsertRowid)))
    .get() as MemoryRule;
}

function replaceActiveRule(
  db: RuleDb,
  existing: MemoryRule,
  input: ManualRuleInput
): MemoryRule {
  const now = new Date().toISOString();
  db.update(memoryRules)
    .set({ status: 'inactive', updated_at: now })
    .where(eq(memoryRules.id, existing.id))
    .run();
  const inserted = db
    .insert(memoryRules)
    .values({
      atomic_id: existing.atomic_id,
      version: existing.version + 1,
      status: 'active',
      kind: existing.kind,
      scope: existing.scope,
      enforced: input.enforced,
      project: existing.project,
      rule_text: input.ruleText,
      applies_when: input.appliesWhen,
      does_not_apply_when: input.doesNotApplyWhen,
      source_prompt_id: existing.source_prompt_id,
      created_at: now,
      updated_at: now,
    })
    .run();
  return db
    .select()
    .from(memoryRules)
    .where(eq(memoryRules.id, Number(inserted.lastInsertRowid)))
    .get() as MemoryRule;
}

export function updateManualRule(id: number, input: Partial<ManualRuleInput>): MemoryRule {
  return rudderDb().transaction((db) => {
    const existing = activeRuleById(id, db);
    if (!existing) throw new Error('active rule not found');
    return replaceActiveRule(db, existing, normalizeManualRuleInput(input));
  }, { behavior: 'immediate' });
}

export function setManualRuleEnforced(id: number, enforced: boolean): MemoryRule {
  return rudderDb().transaction((db) => {
    const existing = activeRuleById(id, db);
    if (!existing) throw new Error('active rule not found');
    if (existing.enforced === enforced) return existing;
    db.update(memoryRules)
      .set({ enforced, updated_at: new Date().toISOString() })
      .where(eq(memoryRules.id, existing.id))
      .run();
    return activeRuleById(existing.id, db)!;
  }, { behavior: 'immediate' });
}

export function deleteManualRule(id: number): void {
  const now = new Date().toISOString();
  const result = rudderDb()
    .update(memoryRules)
    .set({ status: 'inactive', updated_at: now })
    .where(and(eq(memoryRules.id, id), eq(memoryRules.status, 'active')))
    .run();
  if (result.changes === 0) throw new Error('active rule not found');
}

export function renderRulesContext(
  rules: readonly MemoryRule[],
  omitted = 0
): string {
  if (rules.length === 0) return '';
  return [
    '### Rudder learned rules',
    'Check each rule against this turn. Apply it only when its condition fits.',
    ...rules.map(
      (rule) =>
        `- [${rule.atomic_id}] ${rule.rule_text} ` +
        `(when: ${rule.applies_when}; except: ${rule.does_not_apply_when}; enforced: ${rule.enforced ? 'yes' : 'no'})`
    ),
    ...(omitted > 0
      ? [`(${omitted} additional active rules were omitted from this turn.)`]
      : []),
  ].join('\n');
}

export function renderRuleContext(projectKey?: string | null, limit = 12): string {
  const active = activeRules(projectKey);
  const rules = active.slice(0, limit);
  return renderRulesContext(rules, Math.max(0, active.length - rules.length));
}

export function applicableRulesForEvent(event: TraceEvent, limit = 12): MemoryRule[] {
  const applicability = traceApplicability(event);
  const applicableIds = new Set(applicability?.applicableAtomicIds ?? []);
  if (applicableIds.size === 0) return [];
  return activeRules(projectKeyForEvent(event))
    .filter((rule) => applicableIds.has(rule.atomic_id))
    .slice(0, limit);
}

export function traceVerificationsForPrompt(promptId: number): TraceVerification[] {
  const rows = rudderDb()
    .select()
    .from(traceVerifications)
    .where(eq(traceVerifications.prompt_id, promptId))
    .orderBy(asc(traceVerifications.attempt))
    .all() as (typeof traceVerifications.$inferSelect)[];
  return rows.map((row) => {
    let verdicts: unknown[] = [];
    try {
      const parsed = JSON.parse(row.verdicts) as unknown;
      verdicts = Array.isArray(parsed) ? parsed : [];
    } catch {
      verdicts = [];
    }
    return {
      promptId: row.prompt_id,
      attempt: row.attempt,
      enforced: row.enforced,
      reason: row.reason,
      verdicts,
      blocked: row.blocked,
      verifier: row.verifier,
      verifierVersion: row.verifier_version,
      ts: row.ts,
    };
  });
}

export function recordTraceVerification(
  promptId: number,
  result: { enforced: boolean; reason: string; verdicts: unknown[] },
  blocked: boolean,
  verifier: string,
  verifierVersion: number
): TraceVerification {
  const attempt = traceVerificationsForPrompt(promptId).length + 1;
  const ts = new Date().toISOString();
  rudderDb()
    .insert(traceVerifications)
    .values({
      prompt_id: promptId,
      attempt,
      enforced: result.enforced,
      reason: result.reason.slice(0, 2_000),
      verdicts: JSON.stringify(result.verdicts),
      blocked,
      verifier,
      verifier_version: verifierVersion,
      ts,
    })
    .run();
  return {
    promptId,
    attempt,
    enforced: result.enforced,
    reason: result.reason,
    verdicts: result.verdicts,
    blocked,
    verifier,
    verifierVersion,
    ts,
  };
}

function activeRuleByAtomicId(
  atomicId: string,
  projectKey: string | null,
  db: RuleDb = rudderDb()
): MemoryRule | null {
  const normalizedProject = normalizeProjectKey(projectKey);
  const projectClause = normalizedProject
    ? or(
        eq(memoryRules.scope, 'global'),
        and(eq(memoryRules.scope, 'project'), eq(memoryRules.project, normalizedProject))
      )
    : eq(memoryRules.scope, 'global');
  return (
    (db
      .select()
      .from(memoryRules)
      .where(
        and(
          eq(memoryRules.atomic_id, atomicId),
          eq(memoryRules.status, 'active'),
          projectClause
        )
      )
      .orderBy(sql`${memoryRules.version} DESC`)
      .limit(1)
      .get() as MemoryRule | undefined) ?? null
  );
}

type RuleDb = ReturnType<typeof rudderDb> | Parameters<Parameters<ReturnType<typeof rudderDb>['transaction']>[0]>[0];

function applyCandidate(
  db: RuleDb,
  event: TraceEvent,
  candidate: RuleCandidate,
  index: number,
  expectedVersions?: ReadonlyMap<string, number>
): MemoryRule | null {
  const projectKey = projectKeyForEvent(event);
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
    db
      .insert(ruleEvidence)
      .values({ rule_id: existing!.id, prompt_id: event.id, action: 'NOOP', ts: now })
      .onConflictDoNothing()
      .run();
    return existing;
  }

  if (existing) {
    db
      .update(memoryRules)
      .set({ status: 'inactive', updated_at: now })
      .where(eq(memoryRules.id, existing.id))
      .run();
  }

  const atomicId = existing ? existing.atomic_id : `rule_${randomUUID()}`;
  const version = existing ? existing.version + 1 : 1;
  const project = candidate.scope === 'project' ? projectKey : null;
  const inserted = db
    .insert(memoryRules)
    .values({
      atomic_id: atomicId,
      version,
      status: 'active',
      kind: candidate.kind,
      scope: candidate.scope,
      enforced: candidate.enforced ?? true,
      project,
      rule_text: candidate.ruleText,
      applies_when: candidate.appliesWhen,
      does_not_apply_when: candidate.doesNotApplyWhen,
      source_prompt_id: event.id,
      created_at: now,
      updated_at: now,
    })
    .run();
  const ruleId = Number(inserted.lastInsertRowid);
  db.insert(ruleEvidence)
    .values({ rule_id: ruleId, prompt_id: event.id, action: candidate.action, ts: now })
    .run();
  return db.select().from(memoryRules).where(eq(memoryRules.id, ruleId)).get() as MemoryRule;
}

function processableTraceEvent(
  db: RuleDb,
  promptId: number,
  claimToken?: string
): boolean {
  const row = db
    .select({
      status: traceEvents.status,
      attempts: traceEvents.attempts,
      claim_token: traceEvents.claim_token,
    })
    .from(traceEvents)
    .where(eq(traceEvents.prompt_id, promptId))
    .get() as { status: string; attempts: number; claim_token: string | null } | undefined;
  if (!row) return false;
  if (row.status === 'compiling') return !!claimToken && row.claim_token === claimToken;
  return (
    !claimToken && (row.status === 'pending' || (row.status === 'error' && row.attempts < 3))
  );
}

function lastCandidatePerExistingTarget(
  candidates: RuleCandidate[]
): { candidate: RuleCandidate; index: number }[] {
  const actionsByTarget = new Map<string, RuleAction>();
  for (const candidate of candidates) {
    if (!candidate.existingAtomicId) continue;
    const action = actionsByTarget.get(candidate.existingAtomicId);
    if (action && action !== candidate.action) {
      throw new Error(
        `conflicting lifecycle actions for active rule '${candidate.existingAtomicId}'`
      );
    }
    actionsByTarget.set(candidate.existingAtomicId, candidate.action);
  }

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
  return rudderDb().transaction((db) => {
    if (!processableTraceEvent(db, event.id, claimToken)) {
      return [];
    }
    const rules = lastCandidatePerExistingTarget(candidates)
      .map(({ candidate, index }) => applyCandidate(db, event, candidate, index, expectedVersions))
      .filter((rule): rule is MemoryRule => rule !== null);
    db
      .update(traceEvents)
      .set({
        status: 'compiled',
        compiler,
        compiler_version: compilerVersion,
        error: null,
        lease_until: null,
        claim_token: null,
      })
      .where(eq(traceEvents.prompt_id, event.id))
      .run();
    return rules;
  }, { behavior: 'immediate' });
}

/** Apply one candidate transactionally (used by direct callers and tests). */
export function applyRuleCandidate(
  event: TraceEvent,
  candidate: RuleCandidate,
  index: number
): MemoryRule | null {
  return rudderDb().transaction((db) => {
    const rule = applyCandidate(db, event, candidate, index);
    return rule;
  }, { behavior: 'immediate' });
}
