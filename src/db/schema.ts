import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export const schema = {
  prompts,
};
