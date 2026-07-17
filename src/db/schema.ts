import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const prompts = sqliteTable(
  'prompts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull(),
    day: text('day').notNull(),
    source: text('source', { enum: ['claude', 'codex'] }).notNull(),
    session_id: text('session_id'),
    cwd: text('cwd'),
    project: text('project'),
    prompt: text('prompt').notNull(),
    model: text('model'),
    raw: text('raw'),
  },
  (table) => [
    index('idx_prompts_day').on(table.day),
    index('idx_prompts_source').on(table.source),
  ]
);

export const traceEvents = sqliteTable(
  'trace_events',
  {
    prompt_id: integer('prompt_id')
      .primaryKey()
      .references(() => prompts.id),
    turn_id: text('turn_id'),
    hook_prompt_id: text('hook_prompt_id'),
    transcript_path: text('transcript_path'),
    task_text: text('task_text'),
    behavior_text: text('behavior_text'),
    applicable_atomic_ids: text('applicable_atomic_ids'),
    applicability_reason: text('applicability_reason'),
    applicability_agent: text('applicability_agent'),
    applicability_version: integer('applicability_version'),
    applicability_ts: text('applicability_ts'),
    status: text('status').notNull().default('pending'),
    compiler: text('compiler'),
    compiler_version: integer('compiler_version'),
    error: text('error'),
    lease_until: text('lease_until'),
    claim_token: text('claim_token'),
    attempts: integer('attempts').notNull().default(0),
    ts: text('ts').notNull(),
  },
  (table) => [index('idx_trace_events_status').on(table.status)]
);

export const memoryRules = sqliteTable(
  'memory_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    atomic_id: text('atomic_id').notNull(),
    version: integer('version').notNull(),
    status: text('status', { enum: ['active', 'inactive'] }).notNull(),
    kind: text('kind', { enum: ['preference', 'pitfall'] }).notNull(),
    scope: text('scope', { enum: ['global', 'project'] }).notNull(),
    enforced: integer('enforced', { mode: 'boolean' }).notNull().default(true),
    project: text('project'),
    rule_text: text('rule_text').notNull(),
    applies_when: text('applies_when').notNull(),
    does_not_apply_when: text('does_not_apply_when').notNull(),
    source_prompt_id: integer('source_prompt_id').references(() => prompts.id),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_memory_rules_atomic_version').on(table.atomic_id, table.version),
    index('idx_memory_rules_status').on(table.status),
    index('idx_memory_rules_project').on(table.project),
  ]
);

export const traceVerifications = sqliteTable(
  'trace_verifications',
  {
    prompt_id: integer('prompt_id')
      .notNull()
      .references(() => prompts.id),
    attempt: integer('attempt').notNull(),
    enforced: integer('enforced', { mode: 'boolean' }).notNull(),
    reason: text('reason').notNull(),
    verdicts: text('verdicts').notNull(),
    blocked: integer('blocked', { mode: 'boolean' }).notNull(),
    verifier: text('verifier').notNull(),
    verifier_version: integer('verifier_version').notNull(),
    ts: text('ts').notNull(),
  },
  (table) => [primaryKey({ columns: [table.prompt_id, table.attempt] })]
);

export const ruleEvidence = sqliteTable(
  'rule_evidence',
  {
    rule_id: integer('rule_id')
      .notNull()
      .references(() => memoryRules.id),
    prompt_id: integer('prompt_id')
      .notNull()
      .references(() => prompts.id),
    action: text('action').notNull(),
    ts: text('ts').notNull(),
  },
  (table) => [primaryKey({ columns: [table.rule_id, table.prompt_id] })]
);

export const schema = {
  prompts,
  traceEvents,
  traceVerifications,
  memoryRules,
  ruleEvidence,
};

