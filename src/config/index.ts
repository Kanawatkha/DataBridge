import fs from "fs";
import path from "path";
import { loadEnvConfig, type EnvConfig } from "./env-config";
import { validateTaskConfig, type TaskConfig } from "./task-config";

export interface DataBridgeConfig {
  env: EnvConfig;
  task: TaskConfig;
}

/**
 * Loads environment configuration and task-specific migration configuration.
 * Performs all schema and integrity validation checks.
 *
 * @param configFilePath Optional custom path to config.json. If omitted, uses the path from .env.
 */
export function loadAllConfigs(configFilePath?: string): DataBridgeConfig {
  // 1. Load env variables
  const env = loadEnvConfig();

  // Determine actual config file path (CLI takes priority over .env)
  const targetConfigPath = configFilePath || env.configFilePath;
  const absolutePath = path.resolve(targetConfigPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found at path: ${absolutePath}`);
  }

  // 2. Read and parse config.json
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(absolutePath, "utf-8");
  } catch (error: any) {
    throw new Error(`Failed to read config file at ${absolutePath}: ${error.message}`);
  }

  let json: any;
  try {
    json = JSON.parse(fileContent);
  } catch (error: any) {
    throw new Error(`Failed to parse config file at ${absolutePath} as JSON: ${error.message}`);
  }

  // 3. Validate task-specific config against selected writeMode
  const task = validateTaskConfig(json, env.writeMode);

  return {
    env,
    task,
  };
}

export * from "./env-config";
export * from "./task-config";
