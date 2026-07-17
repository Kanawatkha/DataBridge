import { logger } from "../logging/logger";
import { createDatabaseAdapter } from "../adapters/adapter-factory";
import { PrecheckValidator } from "./precheck-validator";
import type { IDatabaseAdapter } from "../adapters/database-adapter.interface";
import type { DataBridgeConfig } from "../config";

export class MigrationExecutor {
  private config: DataBridgeConfig;
  private sourceAdapter: IDatabaseAdapter;
  private targetAdapter: IDatabaseAdapter;

  constructor(config: DataBridgeConfig) {
    this.config = config;
    this.sourceAdapter = createDatabaseAdapter(config.env.sourceDbType, {
      host: config.env.sourceDbHost,
      port: config.env.sourceDbPort,
      user: config.env.sourceDbUser,
      password: config.env.sourceDbPassword,
      database: config.task.source.database,
      connectionLimit: config.env.sourceDbConnectionLimit,
    });
    this.targetAdapter = createDatabaseAdapter(config.env.targetDbType, {
      host: config.env.targetDbHost,
      port: config.env.targetDbPort,
      user: config.env.targetDbUser,
      password: config.env.targetDbPassword,
      database: config.task.target.database,
      connectionLimit: config.env.targetDbConnectionLimit,
    });
  }

  async execute(): Promise<void> {
    const { env, task } = this.config;
    let isTransactionActive = false;

    try {
      // 1. Connect to both source and target databases
      logger.info("Connecting to source database...");
      await this.sourceAdapter.connect();
      logger.info("Connecting to target database...");
      await this.targetAdapter.connect();

      // 2. Run precheck validation
      await PrecheckValidator.run(this.sourceAdapter, this.targetAdapter, this.config);

      // 3. Begin target transaction
      logger.info("Opening transaction on target database...");
      await this.targetAdapter.beginTransaction();
      isTransactionActive = true;

      // 4. Execute basic write mode deletion steps
      if (env.writeMode === "truncateThenInsert") {
        logger.info(`Executing truncate-clean (safe DELETE) on target table: ${task.target.table}`);
        await this.targetAdapter.deleteRows(task.target.table, []);
        logger.info("Target table cleared successfully.");
      } else if (env.writeMode === "deleteThenInsert") {
        logger.warn(`Write mode "${env.writeMode}" delete execution will be finalized in Phase 5. Skipping delete step.`);
      }

      // 5. Stream and migrate rows (Basic batch insert loop for Phase 4)
      logger.info(`Querying source data and streaming... (Batch size: ${env.batchSize})`);
      let totalMigratedRows = 0;

      totalMigratedRows = await this.sourceAdapter.streamQuery(
        task.source.query,
        task.source.params || [],
        env.batchSize,
        async (rows) => {
          logger.debug(`Received batch of ${rows.length} rows from source.`);

          if (env.writeMode === "insertOnly" || env.writeMode === "truncateThenInsert") {
            logger.debug(`Writing batch of ${rows.length} rows to target table ${task.target.table}...`);
            await this.targetAdapter.insertBatch(task.target.table, rows);
            logger.info(`Successfully migrated batch of ${rows.length} rows.`);
          } else {
            logger.warn(
              `Batch of ${rows.length} rows received, but write mode "${env.writeMode}" is not fully implemented in Phase 4. Skipping batch insertion.`
            );
          }
        }
      );

      // 6. Commit transaction
      logger.info("Committing target database transaction...");
      await this.targetAdapter.commit();
      isTransactionActive = false;

      logger.info(`Migration task completed successfully. Total rows migrated: ${totalMigratedRows}`);

    } catch (error: any) {
      logger.error(`Migration executor failed: ${error.message}`);
      
      if (isTransactionActive) {
        logger.warn("Attempting transaction rollback on target database...");
        try {
          await this.targetAdapter.rollback();
          logger.info("Rollback executed successfully.");
        } catch (rollbackError: any) {
          logger.error(`Failed to rollback transaction: ${rollbackError.message}`);
        }
      }
      
      throw error;
    } finally {
      // 7. Cleanup pool resources
      logger.info("Disconnecting database adapter pools...");
      try {
        await this.sourceAdapter.disconnect();
        await this.targetAdapter.disconnect();
        logger.info("Database pools closed.");
      } catch (disconnectError: any) {
        logger.error(`Failed to clean up database connections: ${disconnectError.message}`);
      }
    }
  }
}
