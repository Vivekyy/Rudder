import {
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const promptBranches = sqliteTable(
  'prompt_branches',
  {
    source: text('source').notNull(),
    sessionId: text('session_id').notNull(),
    promptId: text('prompt_id').notNull(),
    promptText: text('prompt_text').notNull(),
    previousAgentOutput: text('previous_agent_output'),
    repository: text('repository').notNull(),
    branch: text('branch').notNull(),
    submittedAt: text('submitted_at').notNull(),
    reconciledAt: text('reconciled_at'),
  },
  (table) => [
    primaryKey({
      columns: [table.source, table.sessionId, table.promptId],
    }),
    index('idx_prompt_branches_repository_branch').on(table.repository, table.branch),
    index('idx_prompt_branches_session').on(table.source, table.sessionId, table.submittedAt),
  ]
);

export const schema = {
  promptBranches,
};
