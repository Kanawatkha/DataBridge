import type { WriteMode } from "./env-config";

export interface ParamConfig {
  name: string;
  type: "string" | "number" | "date";
  value: any;
}

export interface ConditionConfig {
  column: string;
  operator: "=" | "!=" | "<" | "<=" | ">" | ">=" | "IN" | "BETWEEN" | "LIKE";
  value: any;
}

export interface DeleteConditionConfig {
  conditions: ConditionConfig[];
}

export interface SourceConfig {
  database: string;
  table: string;
  query: string;
  params?: ParamConfig[];
}

export interface TargetConfig {
  database: string;
  table: string;
  deleteCondition?: DeleteConditionConfig;
  upsertKeys?: string[];
}

export interface TaskConfig {
  configVersion: string;
  description: string;
  source: SourceConfig;
  target: TargetConfig;
}

const SUPPORTED_CONFIG_VERSION = "1.0";
const SUPPORTED_OPERATORS = ["=", "!=", "<", "<=", ">", ">=", "IN", "BETWEEN", "LIKE"];

export function validateTaskConfig(json: any, writeMode: WriteMode): TaskConfig {
  if (!json || typeof json !== "object") {
    throw new Error("Invalid config.json: File is empty or not a valid JSON object.");
  }

  // 1. Version compatibility check (Fail-Fast)
  if (!json.configVersion) {
    throw new Error(`Missing required field "configVersion" in config.json.`);
  }

  if (String(json.configVersion).trim() !== SUPPORTED_CONFIG_VERSION) {
    throw new Error(
      `Unsupported configVersion: Found "${json.configVersion}", but the system requires "${SUPPORTED_CONFIG_VERSION}". Execution stopped to prevent potential database schema mismatch damage.`
    );
  }

  // 2. Validate source section
  if (!json.source || typeof json.source !== "object") {
    throw new Error(`Missing or invalid "source" block in config.json.`);
  }

  const { database: sDb, table: sTbl, query: sQry, params: sParams } = json.source;

  if (!sDb || typeof sDb !== "string" || sDb.trim() === "") {
    throw new Error(`Field "source.database" is required and must be a non-empty string.`);
  }
  if (!sTbl || typeof sTbl !== "string" || sTbl.trim() === "") {
    throw new Error(`Field "source.table" is required and must be a non-empty string.`);
  }
  if (!sQry || typeof sQry !== "string" || sQry.trim() === "") {
    throw new Error(`Field "source.query" is required and must be a non-empty string.`);
  }

  // Validate params if present
  if (sParams !== undefined) {
    if (!Array.isArray(sParams)) {
      throw new Error(`Field "source.params" must be an array of parameter objects.`);
    }
    sParams.forEach((p, idx) => {
      if (!p.name || typeof p.name !== "string" || p.name.trim() === "") {
        throw new Error(`Missing or invalid name for parameter at index ${idx} in source.params.`);
      }
      if (!p.type || !["string", "number", "date"].includes(p.type)) {
        throw new Error(`Invalid type for parameter "${p.name}". Must be string, number, or date.`);
      }
      if (p.value === undefined) {
        throw new Error(`Parameter "${p.name}" must have a value defined.`);
      }
    });
  }

  // 3. Validate target section
  if (!json.target || typeof json.target !== "object") {
    throw new Error(`Missing or invalid "target" block in config.json.`);
  }

  const { database: tDb, table: tTbl, deleteCondition: tDelCond, upsertKeys: tUpsertKeys } = json.target;

  if (!tDb || typeof tDb !== "string" || tDb.trim() === "") {
    throw new Error(`Field "target.database" is required and must be a non-empty string.`);
  }
  if (!tTbl || typeof tTbl !== "string" || tTbl.trim() === "") {
    throw new Error(`Field "target.table" is required and must be a non-empty string.`);
  }

  // 4. Validate Write Mode specific logic
  if (writeMode === "deleteThenInsert") {
    if (!tDelCond || !Array.isArray(tDelCond.conditions) || tDelCond.conditions.length === 0) {
      throw new Error(`Write mode is "deleteThenInsert", but "target.deleteCondition.conditions" is missing or empty in config.json.`);
    }

    tDelCond.conditions.forEach((c: any, idx: number) => {
      if (!c.column || typeof c.column !== "string" || c.column.trim() === "") {
        throw new Error(`Missing or invalid column name at index ${idx} in target.deleteCondition.conditions.`);
      }
      if (!c.operator || !SUPPORTED_OPERATORS.includes(c.operator.toUpperCase())) {
        throw new Error(
          `Unsupported operator "${c.operator}" at index ${idx} in target.deleteCondition.conditions. Supported operators are: ${SUPPORTED_OPERATORS.join(", ")}`
        );
      }
      
      const operator = c.operator.toUpperCase();

      if (operator === "IN") {
        if (!Array.isArray(c.value)) {
          throw new Error(`Operator "IN" at index ${idx} in deleteCondition requires an array value.`);
        }
      } else if (operator === "BETWEEN") {
        if (!Array.isArray(c.value) || c.value.length !== 2) {
          throw new Error(`Operator "BETWEEN" at index ${idx} in deleteCondition requires an array of exactly 2 elements.`);
        }
      } else if (c.value === undefined) {
        throw new Error(`Condition at index ${idx} in deleteCondition must have a value defined.`);
      }
    });
  }

  if (writeMode === "upsert") {
    if (!tUpsertKeys || !Array.isArray(tUpsertKeys) || tUpsertKeys.length === 0) {
      throw new Error(`Write mode is "upsert", but "target.upsertKeys" is missing or empty in config.json.`);
    }
    tUpsertKeys.forEach((key: any, idx: number) => {
      if (!key || typeof key !== "string" || key.trim() === "") {
        throw new Error(`Invalid key in target.upsertKeys at index ${idx}. Keys must be non-empty strings.`);
      }
    });
  }

  return {
    configVersion: String(json.configVersion),
    description: json.description || "",
    source: {
      database: sDb,
      table: sTbl,
      query: sQry,
      params: sParams || [],
    },
    target: {
      database: tDb,
      table: tTbl,
      deleteCondition: tDelCond || { conditions: [] },
      upsertKeys: tUpsertKeys || [],
    },
  };
}
