import {
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const sessionBranches = sqliteTable(
  'session_branches',
  {
    source: text('source').notNull(),
    sessionId: text('session_id').notNull(),
    repository: text('repository').notNull(),
    branch: text('branch').notNull(),
    observedAt: text('observed_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.source, table.sessionId, table.repository, table.branch],
    }),
    index('idx_session_branches_repository_branch').on(table.repository, table.branch),
  ]
);

export const schema = {
  sessionBranches,
};
