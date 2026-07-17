import { parseArgs, printUsage, type ParsedArgs } from "./cli/args";
import { logger } from "./logging/logger";

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
      logger.info(`Configuration file specified: ${parsed.config}`);
      
      // Bootstrapping note
      logger.info("Initializing system and verifying runtime environments...");
      
      // In Phase 1, we stop here as configuration loading is handled in Phase 2.
      logger.info("Phase 1 initialization completed successfully.");
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
