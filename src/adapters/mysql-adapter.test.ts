import { describe, expect, it } from "bun:test";
import { MySqlAdapter } from "./mysql-adapter";
import { PostgresAdapter } from "./postgres-adapter";
import { MssqlAdapter } from "./mssql-adapter";
import { createDatabaseAdapter } from "./adapter-factory";

describe("MySqlAdapter Named Parameter Translation", () => {
  it("should translate named parameters to positional question marks", () => {
    const adapter = new MySqlAdapter({
      host: "localhost",
      user: "root",
      database: "test",
    });

    const query = "SELECT * FROM users WHERE id = :id AND status = :status";
    const params = [
      { name: "id", type: "number", value: 42 },
      { name: "status", type: "string", value: "active" },
    ];

    // Access private method for testing
    const translate = (adapter as any).translateNamedParameters.bind(adapter);
    const result = translate(query, params);

    expect(result.sql).toBe("SELECT * FROM users WHERE id = ? AND status = ?");
    expect(result.values).toEqual([42, "active"]);
  });

  it("should ignore missing parameters and preserve colons for strings", () => {
    const adapter = new MySqlAdapter({});
    const query = "SELECT * FROM tasks WHERE created_at = :createdAt AND time = '12:00:00'";
    const params = [
      { name: "createdAt", type: "string", value: "2026-07-17" },
    ];

    const translate = (adapter as any).translateNamedParameters.bind(adapter);
    const result = translate(query, params);

    expect(result.sql).toBe("SELECT * FROM tasks WHERE created_at = ? AND time = '12:00:00'");
    expect(result.values).toEqual(["2026-07-17"]);
  });
});

describe("AdapterFactory", () => {
  it("should create MySqlAdapter for mysql dbType", () => {
    const adapter = createDatabaseAdapter("mysql", { host: "127.0.0.1" });
    expect(adapter).toBeInstanceOf(MySqlAdapter);
  });
  it("should create correct adapters for each dbType", () => {
    const pg = createDatabaseAdapter("postgresql", {});
    expect(pg).toBeInstanceOf(PostgresAdapter);

    const mssql = createDatabaseAdapter("mssql", {});
    expect(mssql).toBeInstanceOf(MssqlAdapter);
  });

  it("should throw error for unsupported dbTypes", () => {
    expect(() => createDatabaseAdapter("oracle" as any, {})).toThrow(
      "Unsupported database type"
    );
  });
});
