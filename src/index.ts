import { parseArgs, printUsage, type ParsedArgs } from "./cli/args";
import { logger } from "./logging/logger";
import { loadAllConfigs } from "./config";

const APP_VERSION = "1.0.0";

function main() {
  try {
    const rawArgs = process.argv.slice(2);
    let parsed: ParsedArgs;

    try {
      parsed = parseArgs(rawArgs);
    } catch (err: any) {
      console.error(`Error parsing arguments: ${err.message}`);
      printUsage();
      process.exit(1);
    }

    // 1. Handle Help
    if (parsed.help) {
      printUsage();
      process.exit(0);
    }

    // 2. Handle Version
    if (parsed.version) {
      console.log(`DataBridge version ${APP_VERSION}`);
      process.exit(0);
    }

    // 3. Handle Configuration and bootstrapping migration (Phase 2+)
    if (parsed.config) {
      logger.info(`Starting DataBridge v${APP_VERSION}`);
      
      logger.info(`Loading configurations using: ${parsed.config}`);
      const config = loadAllConfigs(parsed.config);
      
      logger.info("Configuration files loaded and validated successfully.");
      logger.info(`Source Table: ${config.task.source.database}.${config.task.source.table} (${config.env.sourceDbType})`);
      logger.info(`Target Table: ${config.task.target.database}.${config.task.target.table} (${config.env.targetDbType})`);
      logger.info(`Write Mode: ${config.env.writeMode}`);
      
      logger.info("Phase 2 initialization completed successfully.");
      return;
    }

    // 4. Default behavior: no valid action requested
    logger.warn("No execution arguments provided.");
    printUsage();
    process.exit(1);

  } catch (error: any) {
    logger.error(`Critical startup error: ${error.message}`);
    process.exit(1);
  }
}

main();
