import { MySqlAdapter } from "./mysql-adapter";
import { PostgresAdapter } from "./postgres-adapter";
import { MssqlAdapter } from "./mssql-adapter";
import type { IDatabaseAdapter } from "./database-adapter.interface";
import type { DbType } from "../config/env-config";

/**
 * Factory to create database adapter instances based on configuration types.
 *
 * @param type The database type ('mysql' | 'postgresql' | 'mssql')
 * @param options Connection configurations
 */
export function createDatabaseAdapter(type: DbType, options: any): IDatabaseAdapter {
  switch (type) {
    case "mysql":
      return new MySqlAdapter(options);
    case "postgresql":
      return new PostgresAdapter(options);
    case "mssql":
      return new MssqlAdapter(options);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
