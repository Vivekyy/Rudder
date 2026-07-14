declare module 'drizzle-orm/utils' {
  import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';

  export function mapResultRow(
    columns: SelectedFieldsOrdered,
    row: unknown[],
    joinsNotNullableMap?: Record<string, boolean>
  ): unknown;
}

