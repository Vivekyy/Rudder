import type { DatabaseSync, StatementResultingChanges, StatementSync } from 'node:sqlite';
import { NoopCache, type Cache } from 'drizzle-orm/cache/core';
import { DefaultLogger, NoopLogger, type Logger } from 'drizzle-orm/logger';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import { fillPlaceholders, sql, type Query } from 'drizzle-orm/sql';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import {
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteTransaction,
  type PreparedQueryConfig,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import { mapResultRow, type DrizzleConfig } from 'drizzle-orm/utils';
import type { RelationalSchemaConfig, TablesRelationalConfig } from 'drizzle-orm/relations';
import type { WithCacheConfig } from 'drizzle-orm/cache/core/types';

type NodeSQLiteRunResult = StatementResultingChanges;

interface NodeSQLiteSessionOptions {
  logger?: Logger;
  cache?: Cache;
}

type NodeSQLiteDatabase<TSchema extends Record<string, unknown>> = BaseSQLiteDatabase<
  'sync',
  NodeSQLiteRunResult,
  TSchema
> & {
  $client: DatabaseSync;
};

class NodeSQLiteSession<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', NodeSQLiteRunResult, TFullSchema, TSchema> {
  private readonly logger: Logger;
  private readonly cache: Cache;

  constructor(
    private readonly client: DatabaseSync,
    private readonly syncDialect: SQLiteSyncDialect,
    private readonly schema: RelationalSchemaConfig<TSchema> | undefined,
    options: NodeSQLiteSessionOptions = {}
  ) {
    super(syncDialect);
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }

  prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
    queryMetadata?: {
      type: 'select' | 'update' | 'delete' | 'insert';
      tables: string[];
    },
    cacheConfig?: WithCacheConfig
  ): NodeSQLitePreparedQuery<T> {
    return new NodeSQLitePreparedQuery<T>(
      this.client.prepare(query.sql),
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }

  transaction<T>(
    transaction: (tx: NodeSQLiteTransaction<TFullSchema, TSchema>) => T,
    config: SQLiteTransactionConfig = {}
  ): T {
    const tx = new NodeSQLiteTransaction('sync', this.syncDialect, this, this.schema);
    const behavior = config.behavior ? ` ${config.behavior.toUpperCase()}` : '';
    this.client.exec(`BEGIN${behavior}`);
    try {
      const result = transaction(tx);
      this.client.exec('COMMIT');
      return result;
    } catch (err) {
      this.client.exec('ROLLBACK');
      throw err;
    }
  }
}

class NodeSQLiteTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', NodeSQLiteRunResult, TFullSchema, TSchema> {
  constructor(
    resultType: 'sync',
    private readonly syncDialect: SQLiteSyncDialect,
    private readonly nodeSession: NodeSQLiteSession<TFullSchema, TSchema>,
    schema: RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex = 0
  ) {
    super(resultType, syncDialect, nodeSession, schema, nestedIndex);
  }

  transaction<T>(transaction: (tx: NodeSQLiteTransaction<TFullSchema, TSchema>) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSQLiteTransaction(
      'sync',
      this.syncDialect,
      this.nodeSession,
      this.schema,
      this.nestedIndex + 1
    );
    this.nodeSession.run(sql.raw(`SAVEPOINT ${savepointName}`));
    try {
      const result = transaction(tx);
      this.nodeSession.run(sql.raw(`RELEASE SAVEPOINT ${savepointName}`));
      return result;
    } catch (err) {
      this.nodeSession.run(sql.raw(`ROLLBACK TO SAVEPOINT ${savepointName}`));
      throw err;
    }
  }
}

class NodeSQLitePreparedQuery<
  T extends Omit<PreparedQueryConfig, 'run'> = Omit<PreparedQueryConfig, 'run'>,
> extends SQLitePreparedQuery<{
  type: 'sync';
  run: NodeSQLiteRunResult;
  all: T['all'];
  get: T['get'];
  values: T['values'];
  execute: T['execute'];
}> {
  joinsNotNullableMap?: Record<string, boolean>;

  constructor(
    private readonly stmt: StatementSync,
    query: Query,
    private readonly logger: Logger,
    cache: Cache,
    queryMetadata: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] } | undefined,
    cacheConfig: WithCacheConfig | undefined,
    private readonly fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly isArrayMode: boolean,
    private readonly customResultMapper?: (rows: unknown[][]) => unknown
  ) {
    super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
  }

  run(placeholderValues?: Record<string, unknown>): NodeSQLiteRunResult {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...params);
  }

  all(placeholderValues?: Record<string, unknown>): T['all'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const rows = this.stmt.all(...params);
    if (!this.fields && !this.customResultMapper) {
      return rows as T['all'];
    }
    const values = rows.map((row) => Object.values(row));
    if (this.customResultMapper) {
      return this.customResultMapper(values) as T['all'];
    }
    return values.map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap)) as T['all'];
  }

  get(placeholderValues?: Record<string, unknown>): T['get'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const row = this.stmt.get(...params);
    if (!row) return undefined as T['get'];
    if (!this.fields && !this.customResultMapper) {
      return row as T['get'];
    }
    const values = [Object.values(row)];
    if (this.customResultMapper) {
      return this.customResultMapper(values) as T['get'];
    }
    return mapResultRow(this.fields!, values[0], this.joinsNotNullableMap) as T['get'];
  }

  values(placeholderValues?: Record<string, unknown>): T['values'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.all(...params).map((row) => Object.values(row)) as T['values'];
  }

  isResponseInArrayMode(): boolean {
    return this.isArrayMode;
  }
}

export function drizzleNodeSqlite<TSchema extends Record<string, unknown> = Record<string, never>>(
  client: DatabaseSync,
  config: DrizzleConfig<TSchema> = {}
): NodeSQLiteDatabase<TSchema> {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger: Logger | undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  let relationalSchema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    relationalSchema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new NodeSQLiteSession(client, dialect, relationalSchema, {
    logger,
    cache: config.cache,
  });
  const db = new BaseSQLiteDatabase(
    'sync',
    dialect,
    session,
    relationalSchema
  ) as NodeSQLiteDatabase<TSchema>;
  db.$client = client;
  return db;
}

