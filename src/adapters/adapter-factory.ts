import { MySqlAdapter } from "./mysql-adapter";
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
      throw new Error(`PostgreSQL database type is not implemented yet (scheduled for Phase 7).`);
    case "mssql":
      throw new Error(`MSSQL database type is not implemented yet (scheduled for Phase 7).`);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
