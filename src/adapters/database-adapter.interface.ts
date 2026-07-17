import type { ConditionConfig } from "../config/task-config";

export interface IDatabaseAdapter {
  /**
   * Initializes the connection pool and connects to the database.
   */
  connect(): Promise<void>;

  /**
   * Closes all connections in the pool and clean up resources.
   */
  disconnect(): Promise<void>;

  /**
   * Checks if the database is reachable.
   */
  checkConnection(): Promise<boolean>;

  /**
   * Verifies if a given table exists in the specified database.
   */
  tableExists(database: string, tableName: string): Promise<boolean>;

  /**
   * Starts a new database transaction.
   */
  beginTransaction(): Promise<void>;

  /**
   * Commits the active database transaction.
   */
  commit(): Promise<void>;

  /**
   * Rolls back the active database transaction.
   */
  rollback(): Promise<void>;

  /**
   * Streams a SELECT query using cursor-based retrieval.
   * Groups rows into batches of `batchSize` and triggers `onBatch` callback.
   * Returns the total number of rows streamed.
   *
   * @param query Raw SQL query containing named parameters (e.g. :paramName)
   * @param params Parameter list containing names, types, and values
   * @param batchSize Number of rows per batch
   * @param onBatch Async callback triggered when a batch of rows is ready
   */
  streamQuery(
    query: string,
    params: { name: string; type: string; value: any }[],
    batchSize: number,
    onBatch: (rows: any[]) => Promise<void>
  ): Promise<number>;

  /**
   * Performs bulk inserts of multiple rows within the active transaction.
   *
   * @param tableName The target table to insert into (database scope is handled by adapter)
   * @param rows Array of objects representing the row data (key-value pairs matching column names)
   */
  insertBatch(tableName: string, rows: any[]): Promise<void>;

  /**
   * Deletes target rows using condition arrays. Used when WRITE_MODE = deleteThenInsert.
   * Runs within the active transaction.
   *
   * @param tableName The target table to delete rows from
   * @param conditions Array of conditions containing column, operator, and literal values
   */
  deleteRows(tableName: string, conditions: ConditionConfig[]): Promise<void>;

  /**
   * Performs bulk upserts (insert-or-update) within the active transaction.
   *
   * @param tableName The target table to upsert into
   * @param rows Array of objects representing the row data (key-value pairs matching column names)
   * @param upsertKeys Key column(s) used to check for duplicate/existing records
   */
  upsertBatch(tableName: string, rows: any[], upsertKeys: string[]): Promise<void>;
}
