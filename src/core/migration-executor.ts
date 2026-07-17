import { logger } from "../logging/logger";
import { createDatabaseAdapter } from "../adapters/adapter-factory";
import { PrecheckValidator } from "./precheck-validator";
import { ParamResolver } from "./param-resolver";
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

      // 4. Execute write mode deletion steps
      if (env.writeMode === "truncateThenInsert") {
        logger.info(`Executing truncate-clean (safe DELETE) on target table: ${task.target.table}`);
        await this.targetAdapter.deleteRows(task.target.table, []);
        logger.info("Target table cleared successfully.");
      } else if (env.writeMode === "deleteThenInsert") {
        logger.info(`Resolving delete condition parameters for write mode "${env.writeMode}"...`);
        const resolvedConditions = ParamResolver.resolveDeleteConditions(
          task.target.deleteCondition?.conditions || [],
          task.source.params || []
        );
        logger.info(`Executing scoped DELETE on target table: ${task.target.table}`);
        await this.targetAdapter.deleteRows(task.target.table, resolvedConditions);
        logger.info("Target scoped rows deleted successfully.");
      }

      // 5. Stream and migrate rows with Batch Concurrency throttling
      logger.info(`Querying source data and streaming... (Batch size: ${env.batchSize}, Concurrency limit: ${env.batchConcurrencyLimit})`);
      let totalMigratedRows = 0;
      const activePromises = new Set<Promise<void>>();

      totalMigratedRows = await this.sourceAdapter.streamQuery(
        task.source.query,
        task.source.params || [],
        env.batchSize,
        async (rows) => {
          logger.debug(`Received batch of ${rows.length} rows from source.`);

          let writePromise: Promise<void>;

          if (env.writeMode === "upsert") {
            logger.debug(`Upserting batch of ${rows.length} rows to target table ${task.target.table}...`);
            writePromise = this.targetAdapter.upsertBatch(task.target.table, rows, task.target.upsertKeys || []);
          } else {
            logger.debug(`Inserting batch of ${rows.length} rows to target table ${task.target.table}...`);
            writePromise = this.targetAdapter.insertBatch(task.target.table, rows);
          }

          const wrappedPromise = writePromise
            .then(() => {
              logger.info(`Successfully processed batch of ${rows.length} rows.`);
              activePromises.delete(wrappedPromise);
            })
            .catch((err) => {
              activePromises.delete(wrappedPromise);
              throw err;
            });

          activePromises.add(wrappedPromise);

          if (activePromises.size >= env.batchConcurrencyLimit) {
            logger.debug(`Concurrency limit reached (${activePromises.size}/${env.batchConcurrencyLimit}). Throttling stream...`);
            // Wait for at least one active write to finish before returning (applies backpressure to streamQuery)
            await Promise.race(activePromises);
          }
        }
      );

      // Await all remaining writes in progress before committing
      if (activePromises.size > 0) {
        logger.info(`Awaiting ${activePromises.size} remaining batch writes to complete...`);
        await Promise.all(activePromises);
      }

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
