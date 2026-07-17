import { describe, expect, it } from "bun:test";
import { ParamResolver } from "./param-resolver";
import type { ConditionConfig, ParamConfig } from "../config/task-config";

describe("ParamResolver", () => {
  it("should resolve parameter references ($ref:name) correctly", () => {
    const conditions: ConditionConfig[] = [
      { column: "STORE_ID", operator: "=", value: "$ref:storeId" },
      { column: "UPDATE_DATE", operator: ">", value: "2026-01-01" },
    ];

    const sourceParams: ParamConfig[] = [
      { name: "storeId", type: "string", value: "S1234" },
    ];

    const resolved = ParamResolver.resolveDeleteConditions(conditions, sourceParams);

    expect(resolved[0].value).toBe("S1234");
    expect(resolved[1].value).toBe("2026-01-01");
  });

  it("should throw an error if a reference cannot be found in sourceParams", () => {
    const conditions: ConditionConfig[] = [
      { column: "STORE_ID", operator: "=", value: "$ref:storeId" },
    ];

    const sourceParams: ParamConfig[] = [
      { name: "differentParam", type: "string", value: "S1234" },
    ];

    expect(() => ParamResolver.resolveDeleteConditions(conditions, sourceParams)).toThrow(
      'Parameter reference "$ref:storeId" at index 0 in target.deleteCondition.conditions could not be resolved'
    );
  });
});
