import type { ConditionConfig, ParamConfig } from "../config/task-config";

export class ParamResolver {
  /**
   * Resolves "$ref:paramName" references inside the target delete conditions array.
   * Maps referenced values directly to their matching source query parameters.
   * Throws an error if a reference is specified but cannot be resolved.
   */
  static resolveDeleteConditions(
    conditions: ConditionConfig[],
    sourceParams: ParamConfig[]
  ): ConditionConfig[] {
    const paramMap = new Map<string, any>();
    sourceParams.forEach((p) => {
      paramMap.set(p.name, p.value);
    });

    return conditions.map((c, idx) => {
      if (typeof c.value === "string" && c.value.startsWith("$ref:")) {
        const refName = c.value.substring("$ref:".length).trim();
        
        if (!paramMap.has(refName)) {
          throw new Error(
            `ParamResolver failed: Parameter reference "${c.value}" at index ${idx} in target.deleteCondition.conditions could not be resolved from source.params.`
          );
        }

        return {
          ...c,
          value: paramMap.get(refName),
        };
      }
      return c;
    });
  }
}
