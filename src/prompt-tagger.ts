import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { rudderDb } from './db/client.ts';
import { promptBranches } from './db/schema.ts';
import {
  normalizeBranch,
  normalizeRepository,
  resolveBranchContext,
} from './git-context.ts';

export interface PromptBranchRow {
  source: string;
  sessionId: string;
  promptId: string;
  promptText: string;
  repository: string;
  branch: string;
  submittedAt: string;
  reconciledAt: string | null;
}

export interface RecordPromptBranchInput {
  source: string;
  sessionId: string;
  promptId?: string;
  promptText: string;
  cwd?: string;
  submittedAt?: string | Date;
}

export interface ReconcilePromptBranchInput {
  source: string;
  sessionId: string;
  promptId?: string | null;
  cwd?: string;
  reconciledAt?: string | Date;
}

export type ObservePromptBranchInput = Omit<ReconcilePromptBranchInput, 'reconciledAt'>;

function timestamp(value: string | Date | undefined, field: string): string {
  const date = value instanceof Date ? value : value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
}

function nonblank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must not be blank`);
  return normalized;
}

function optionalNonblank(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  return nonblank(value, field);
}

function exactPrompt(
  source: string,
  sessionId: string,
  promptId: string
): PromptBranchRow | null {
  return (rudderDb()
    .select()
    .from(promptBranches)
    .where(
      and(
        eq(promptBranches.source, source),
        eq(promptBranches.sessionId, sessionId),
        eq(promptBranches.promptId, promptId)
      )
    )
    .get() ?? null) as PromptBranchRow | null;
}

/** Store a submitted prompt with the branch checked out before the turn runs. */
export function recordPromptBranch(input: RecordPromptBranchInput): PromptBranchRow {
  const source = nonblank(input.source, 'source');
  const sessionId = nonblank(input.sessionId, 'sessionId');
  const promptId = optionalNonblank(input.promptId, 'promptId') ?? randomUUID();
  if (!input.promptText.trim()) throw new TypeError('promptText must not be blank');
  const context = resolveBranchContext(input.cwd);
  const submittedAt = timestamp(input.submittedAt, 'submittedAt');

  rudderDb()
    .insert(promptBranches)
    .values({
      source,
      sessionId,
      promptId,
      promptText: input.promptText,
      repository: context.repository,
      branch: context.branch,
      submittedAt,
      reconciledAt: null,
    })
    .onConflictDoUpdate({
      target: [promptBranches.source, promptBranches.sessionId, promptBranches.promptId],
      set: {
        promptText: input.promptText,
        submittedAt: sql`min(${promptBranches.submittedAt}, ${submittedAt})`,
      },
    })
    .run();

  return exactPrompt(source, sessionId, promptId)!;
}

function latestUnreconciledPrompt(source: string, sessionId: string): PromptBranchRow | null {
  return (rudderDb()
    .select()
    .from(promptBranches)
    .where(
      and(
        eq(promptBranches.source, source),
        eq(promptBranches.sessionId, sessionId),
        isNull(promptBranches.reconciledAt)
      )
    )
    .orderBy(desc(promptBranches.submittedAt), desc(promptBranches.promptId))
    .get() ?? null) as PromptBranchRow | null;
}

function updatePromptBranch(
  input: ReconcilePromptBranchInput,
  finalize: boolean
): PromptBranchRow | null {
  const source = nonblank(input.source, 'source');
  const sessionId = nonblank(input.sessionId, 'sessionId');
  const promptId = optionalNonblank(input.promptId, 'promptId');
  const target = promptId
    ? exactPrompt(source, sessionId, promptId)
    : latestUnreconciledPrompt(source, sessionId);
  if (!target) return null;

  const context = resolveBranchContext(input.cwd);

  rudderDb()
    .update(promptBranches)
    .set(
      finalize
        ? {
            repository: context.repository,
            branch: context.branch,
            reconciledAt: timestamp(input.reconciledAt, 'reconciledAt'),
          }
        : {
            repository: context.repository,
            branch: context.branch,
          }
    )
    .where(
      and(
        eq(promptBranches.source, target.source),
        eq(promptBranches.sessionId, target.sessionId),
        eq(promptBranches.promptId, target.promptId)
      )
    )
    .run();

  return exactPrompt(target.source, target.sessionId, target.promptId);
}

/** Update an open prompt after a tool call without marking its turn complete. */
export function observePromptBranch(input: ObservePromptBranchInput): PromptBranchRow | null {
  return updatePromptBranch(input, false);
}

/** Update a submitted prompt to the branch checked out after its agent turn. */
export function reconcilePromptBranch(
  input: ReconcilePromptBranchInput
): PromptBranchRow | null {
  return updatePromptBranch(input, true);
}

export function promptsForSession(source: string, sessionId: string): PromptBranchRow[] {
  const normalizedSource = nonblank(source, 'source');
  const normalizedSessionId = nonblank(sessionId, 'sessionId');
  return rudderDb()
    .select()
    .from(promptBranches)
    .where(
      and(
        eq(promptBranches.source, normalizedSource),
        eq(promptBranches.sessionId, normalizedSessionId)
      )
    )
    .orderBy(asc(promptBranches.submittedAt), asc(promptBranches.promptId))
    .all() as PromptBranchRow[];
}

export function promptsForBranch(repository: string, branch: string): PromptBranchRow[] {
  const normalizedRepository = normalizeRepository(repository);
  const normalizedBranchName = normalizeBranch(branch);
  return rudderDb()
    .select()
    .from(promptBranches)
    .where(
      and(
        eq(promptBranches.repository, normalizedRepository),
        eq(promptBranches.branch, normalizedBranchName)
      )
    )
    .orderBy(
      asc(promptBranches.submittedAt),
      asc(promptBranches.source),
      asc(promptBranches.sessionId),
      asc(promptBranches.promptId)
    )
    .all() as PromptBranchRow[];
}
