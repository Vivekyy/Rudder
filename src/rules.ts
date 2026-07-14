import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  memoryRules,
  prompts,
  rudderDb,
  ruleEvidence,
  traceEvents,
  type PromptRow,
} from './db/index.ts';

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
  rudderDb()
    .insert(traceEvents)
    .values({
      prompt_id: promptId,
      transcript_path: transcriptPath,
      task_text: taskText || null,
      behavior_text: behaviorText || null,
      status: 'pending',
      ts: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

export function pendingTraceEvents(): TraceEvent[] {
  const now = new Date().toISOString();
  return rudderDb()
    .select({
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
      transcript_path: traceEvents.transcript_path,
      task_text: traceEvents.task_text,
      behavior_text: traceEvents.behavior_text,
      lease_until: traceEvents.lease_until,
      claim_token: traceEvents.claim_token,
      attempts: traceEvents.attempts,
    })
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
  const projectClause = projectKey
    ? or(
        eq(memoryRules.scope, 'global'),
        and(eq(memoryRules.scope, 'project'), eq(memoryRules.project, projectKey))
      )
    : eq(memoryRules.scope, 'global');
  return rudderDb()
    .select()
    .from(memoryRules)
    .where(and(eq(memoryRules.status, 'active'), projectClause))
    .orderBy(
      sql`CASE ${memoryRules.kind} WHEN 'pitfall' THEN 0 WHEN 'preference' THEN 1 ELSE 2 END`,
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
  db: RuleDb = rudderDb()
): MemoryRule | null {
  const projectClause = projectKey
    ? or(
        eq(memoryRules.scope, 'global'),
        and(eq(memoryRules.scope, 'project'), eq(memoryRules.project, projectKey))
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
      .set({ status: 'superseded', updated_at: now })
      .where(eq(memoryRules.id, existing.id))
      .run();
  }

  const atomicId =
    candidate.action === 'UPDATE' ? existing!.atomic_id : `rule-${event.id}-${index + 1}`;
  const version = candidate.action === 'UPDATE' ? existing!.version + 1 : 1;
  const project = candidate.scope === 'project' ? projectKey : null;
  const inserted = db
    .insert(memoryRules)
    .values({
      atomic_id: atomicId,
      version,
      status: 'active',
      kind: candidate.kind,
      scope: candidate.scope,
      project,
      rule_text: candidate.ruleText,
      applies_when: candidate.appliesWhen,
      does_not_apply_when: candidate.doesNotApplyWhen,
      source_prompt_id: event.id,
      supersedes_rule_id: existing?.id ?? null,
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
