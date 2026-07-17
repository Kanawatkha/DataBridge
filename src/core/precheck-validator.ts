import { logger } from "../logging/logger";
import type { IDatabaseAdapter } from "../adapters/database-adapter.interface";
import type { DataBridgeConfig } from "../config";

export class PrecheckValidator {
  /**
   * Runs validation checks on database connectivity and table existence.
   * Throws an error immediately if any check fails.
   */
  static async run(
    sourceAdapter: IDatabaseAdapter,
    targetAdapter: IDatabaseAdapter,
    config: DataBridgeConfig
  ): Promise<void> {
    const { env, task } = config;

    if (!env.precheckEnabled) {
      logger.info("Precheck validation is disabled in configuration.");
      return;
    }

    logger.info("Starting precheck validation...");

    // 1. Connection Checks
    if (env.precheckCheckConnection) {
      logger.debug("Verifying connection to source database...");
      await sourceAdapter.checkConnection();
      logger.info("Source database connection verified.");

      logger.debug("Verifying connection to target database...");
      await targetAdapter.checkConnection();
      logger.info("Target database connection verified.");
    }

    // 2. Table Existence Checks
    if (env.precheckCheckTableExists) {
      logger.debug(`Verifying existence of source table: ${task.source.database}.${task.source.table}`);
      const sourceExists = await sourceAdapter.tableExists(task.source.database, task.source.table);
      if (!sourceExists) {
        throw new Error(
          `Precheck failed: Source table "${task.source.database}.${task.source.table}" does not exist.`
        );
      }
      logger.info(`Source table "${task.source.database}.${task.source.table}" verified.`);

      logger.debug(`Verifying existence of target table: ${task.target.database}.${task.target.table}`);
      const targetExists = await targetAdapter.tableExists(task.target.database, task.target.table);
      if (!targetExists) {
        throw new Error(
          `Precheck failed: Target table "${task.target.database}.${task.target.table}" does not exist.`
        );
      }
      logger.info(`Target table "${task.target.database}.${task.target.table}" verified.`);
    }

    logger.info("Precheck validation completed successfully with zero errors.");
  }
}
