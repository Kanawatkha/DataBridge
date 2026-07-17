import { describe, expect, it } from "bun:test";
import { PostgresAdapter } from "./postgres-adapter";

describe("PostgresAdapter Named Parameter Translation", () => {
  it("should translate named parameters to positional variables ($1, $2)", () => {
    const adapter = new PostgresAdapter({
      host: "localhost",
      user: "postgres",
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

    expect(result.sql).toBe("SELECT * FROM users WHERE id = $1 AND status = $2");
    expect(result.values).toEqual([42, "active"]);
  });

  it("should preserve colons in strings and skip missing parameters", () => {
    const adapter = new PostgresAdapter({});
    const query = "SELECT * FROM logs WHERE type = :type AND time = '12:00:00'";
    const params = [
      { name: "type", type: "string", value: "syslog" },
    ];

    const translate = (adapter as any).translateNamedParameters.bind(adapter);
    const result = translate(query, params);

    expect(result.sql).toBe("SELECT * FROM logs WHERE type = $1 AND time = '12:00:00'");
    expect(result.values).toEqual(["syslog"]);
  });
});
