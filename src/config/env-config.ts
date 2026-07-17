export type WriteMode = "insertOnly" | "deleteThenInsert" | "upsert" | "truncateThenInsert";
export type RetryBackoff = "exponential" | "fixed";
export type DbType = "mysql" | "mssql" | "postgresql";

export interface EnvConfig {
  sourceDbType: DbType;
  sourceDbHost: string;
  sourceDbPort: number;
  sourceDbUser: string;
  sourceDbPassword?: string;
  sourceDbConnectionLimit: number;

  targetDbType: DbType;
  targetDbHost: string;
  targetDbPort: number;
  targetDbUser: string;
  targetDbPassword?: string;
  targetDbConnectionLimit: number;

  configFilePath: string;
  writeMode: WriteMode;
  batchSize: number;
  maxRetries: number;
  retryBackoff: RetryBackoff;
  maxExecutionTimeHours: number;
  batchConcurrencyLimit: number;

  precheckEnabled: boolean;
  precheckCheckConnection: boolean;
  precheckCheckTableExists: boolean;

  logDir: string;
  logLevel: string;
  nodeEnv: string;
}

export function loadEnvConfig(): EnvConfig {
  const getEnvString = (key: string, fallback = ""): string => {
    return process.env[key] || fallback;
  };

  const getEnvNumber = (key: string, fallback: number): number => {
    const value = process.env[key];
    if (value === undefined || value === "") return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  const getEnvBoolean = (key: string, fallback: boolean): boolean => {
    const value = process.env[key];
    if (value === undefined || value === "") return fallback;
    return value.toLowerCase() === "true";
  };

  // Validate required db types
  const sourceDbTypeStr = getEnvString("SOURCE_DB_TYPE").toLowerCase();
  const targetDbTypeStr = getEnvString("TARGET_DB_TYPE").toLowerCase();

  if (!["mysql", "mssql", "postgresql"].includes(sourceDbTypeStr)) {
    throw new Error(`Invalid SOURCE_DB_TYPE: "${process.env.SOURCE_DB_TYPE}". Must be mysql, mssql, or postgresql.`);
  }

  if (!["mysql", "mssql", "postgresql"].includes(targetDbTypeStr)) {
    throw new Error(`Invalid TARGET_DB_TYPE: "${process.env.TARGET_DB_TYPE}". Must be mysql, mssql, or postgresql.`);
  }

  const sourceDbType = sourceDbTypeStr as DbType;
  const targetDbType = targetDbTypeStr as DbType;

  // Default port selection based on db type
  const defaultSourcePort = sourceDbType === "mysql" ? 3306 : sourceDbType === "mssql" ? 1433 : 5432;
  const defaultTargetPort = targetDbType === "mysql" ? 3306 : targetDbType === "mssql" ? 1433 : 5432;

  // Validate write mode
  const writeModeStr = getEnvString("WRITE_MODE", "insertOnly");
  const validWriteModes = ["insertOnly", "deleteThenInsert", "upsert", "truncateThenInsert"];
  if (!validWriteModes.includes(writeModeStr)) {
    throw new Error(`Invalid WRITE_MODE: "${writeModeStr}". Must be one of: ${validWriteModes.join(", ")}`);
  }
  const writeMode = writeModeStr as WriteMode;

  // Validate retry backoff
  const retryBackoffStr = getEnvString("RETRY_BACKOFF", "exponential").toLowerCase();
  if (!["exponential", "fixed"].includes(retryBackoffStr)) {
    throw new Error(`Invalid RETRY_BACKOFF: "${retryBackoffStr}". Must be exponential or fixed.`);
  }
  const retryBackoff = retryBackoffStr as RetryBackoff;

  // Ensure connection details are provided
  const requiredConnectionVars = [
    { name: "SOURCE_DB_HOST", val: getEnvString("SOURCE_DB_HOST") },
    { name: "SOURCE_DB_USER", val: getEnvString("SOURCE_DB_USER") },
    { name: "TARGET_DB_HOST", val: getEnvString("TARGET_DB_HOST") },
    { name: "TARGET_DB_USER", val: getEnvString("TARGET_DB_USER") },
  ];

  for (const item of requiredConnectionVars) {
    if (!item.val) {
      throw new Error(`Missing required connection environment variable: ${item.name}`);
    }
  }

  return {
    sourceDbType,
    sourceDbHost: getEnvString("SOURCE_DB_HOST"),
    sourceDbPort: getEnvNumber("SOURCE_DB_PORT", defaultSourcePort),
    sourceDbUser: getEnvString("SOURCE_DB_USER"),
    sourceDbPassword: process.env.SOURCE_DB_PASSWORD,
    sourceDbConnectionLimit: getEnvNumber("SOURCE_DB_CONNECTION_LIMIT", 10),

    targetDbType,
    targetDbHost: getEnvString("TARGET_DB_HOST"),
    targetDbPort: getEnvNumber("TARGET_DB_PORT", defaultTargetPort),
    targetDbUser: getEnvString("TARGET_DB_USER"),
    targetDbPassword: process.env.TARGET_DB_PASSWORD,
    targetDbConnectionLimit: getEnvNumber("TARGET_DB_CONNECTION_LIMIT", 10),

    configFilePath: getEnvString("CONFIG_FILE_PATH", "./config.json"),
    writeMode,
    batchSize: getEnvNumber("BATCH_SIZE", 500),
    maxRetries: getEnvNumber("MAX_RETRIES", 5),
    retryBackoff,
    maxExecutionTimeHours: getEnvNumber("MAX_EXECUTION_TIME_HOURS", 20),
    batchConcurrencyLimit: getEnvNumber("BATCH_CONCURRENCY_LIMIT", 4),

    precheckEnabled: getEnvBoolean("PRECHECK_ENABLED", true),
    precheckCheckConnection: getEnvBoolean("PRECHECK_CHECK_CONNECTION", true),
    precheckCheckTableExists: getEnvBoolean("PRECHECK_CHECK_TABLE_EXISTS", true),

    logDir: getEnvString("LOG_DIR", "./logs"),
    logLevel: getEnvString("LOG_LEVEL", "info"),
    nodeEnv: getEnvString("NODE_ENV", "production"),
  };
}
