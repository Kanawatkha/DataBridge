import pg from "pg";
import QueryStream from "pg-query-stream";
import type { IDatabaseAdapter } from "./database-adapter.interface";
import type { ConditionConfig } from "../config/task-config";

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: pg.Pool | null = null;
  private txClient: pg.PoolClient | null = null;
  private options: any;

  constructor(options: any) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    this.pool = new pg.Pool({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      database: this.options.database,
      max: this.options.connectionLimit || 10,
    });
  }

  async disconnect(): Promise<void> {
    if (this.txClient) {
      this.txClient.release();
      this.txClient = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    this.ensurePool();
    let client: pg.PoolClient | null = null;
    try {
      client = await this.pool!.connect();
      await client.query("SELECT 1");
      return true;
    } catch (error: any) {
      throw new Error(`PostgreSQL connection check failed: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  }

  async tableExists(database: string, tableName: string): Promise<boolean> {
    this.ensurePool();
    let client: pg.PoolClient | null = null;
    try {
      client = await this.pool!.connect();
      const sql = `
        SELECT 1 FROM information_schema.tables 
        WHERE table_catalog = $1 AND table_name = $2 
        LIMIT 1
      `;
      const res = await client.query(sql, [database, tableName]);
      return res.rowCount !== null && res.rowCount > 0;
    } catch (error: any) {
      throw new Error(`PostgreSQL tableExists check failed for ${database}.${tableName}: ${error.message}`);
    } finally {
      if (client) client.release();
    }
  }

  async beginTransaction(): Promise<void> {
    this.ensurePool();
    if (this.txClient) {
      throw new Error("A transaction is already active on this adapter.");
    }
    try {
      this.txClient = await this.pool!.connect();
      await this.txClient.query("BEGIN");
    } catch (error: any) {
      if (this.txClient) {
        this.txClient.release();
        this.txClient = null;
      }
      throw new Error(`Failed to start PostgreSQL transaction: ${error.message}`);
    }
  }

  async commit(): Promise<void> {
    if (!this.txClient) {
      throw new Error("No active transaction to commit.");
    }
    try {
      await this.txClient.query("COMMIT");
    } catch (error: any) {
      throw new Error(`Failed to commit PostgreSQL transaction: ${error.message}`);
    } finally {
      this.txClient.release();
      this.txClient = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.txClient) {
      return;
    }
    try {
      await this.txClient.query("ROLLBACK");
    } catch (error: any) {
      throw new Error(`Failed to rollback PostgreSQL transaction: ${error.message}`);
    } finally {
      this.txClient.release();
      this.txClient = null;
    }
  }

  async streamQuery(
    query: string,
    params: { name: string; type: string; value: any }[],
    batchSize: number,
    onBatch: (rows: any[]) => Promise<void>
  ): Promise<number> {
    this.ensurePool();
    const client = await this.pool!.connect();

    try {
      const { sql, values } = this.translateNamedParameters(query, params);
      const queryStream = new QueryStream(sql, values, { batchSize: batchSize });
      const stream = client.query(queryStream);

      return await new Promise<number>((resolve, reject) => {
        let rowBuffer: any[] = [];
        let totalRows = 0;
        let isProcessingBatch = false;
        let isStreamEnded = false;

        const checkEndState = async () => {
          if (isStreamEnded && !isProcessingBatch) {
            try {
              if (rowBuffer.length > 0) {
                isProcessingBatch = true;
                await onBatch(rowBuffer);
                rowBuffer = [];
              }
              client.release();
              resolve(totalRows);
            } catch (err) {
              client.release();
              reject(err);
            }
          }
        };

        stream.on("data", async (row: any) => {
          rowBuffer.push(row);
          totalRows++;

          if (rowBuffer.length >= batchSize) {
            stream.pause();
            isProcessingBatch = true;
            try {
              await onBatch(rowBuffer);
              rowBuffer = [];
              isProcessingBatch = false;

              if (!isStreamEnded) {
                stream.resume();
              } else {
                await checkEndState();
              }
            } catch (err) {
              stream.destroy();
              client.release();
              reject(err);
            }
          }
        });

        stream.on("error", (err: any) => {
          stream.destroy();
          client.release();
          reject(new Error(`PostgreSQL streaming error: ${err.message}`));
        });

        stream.on("end", async () => {
          isStreamEnded = true;
          await checkEndState();
        });
      });
    } catch (error: any) {
      client.release();
      throw error;
    }
  }

  async insertBatch(tableName: string, rows: any[]): Promise<void> {
    if (!this.txClient) {
      throw new Error("PostgreSQL insertBatch must be called within an active transaction.");
    }
    if (rows.length === 0) return;

    try {
      const columns = Object.keys(rows[0]);
      const quotedColumns = columns.map((col) => `"${col}"`).join(", ");
      
      let valCounter = 1;
      const rowPlaceholders = `(${columns.map(() => `$${valCounter++}`).join(", ")})`;
      const allPlaceholders = rows.map(() => rowPlaceholders).join(", ");

      const sql = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${allPlaceholders}`;
      const values = rows.flatMap((row) => columns.map((col) => row[col]));

      await this.txClient.query(sql, values);
    } catch (error: any) {
      throw new Error(`PostgreSQL insertBatch failed for table ${tableName}: ${error.message}`);
    }
  }

  async deleteRows(tableName: string, conditions: ConditionConfig[]): Promise<void> {
    if (!this.txClient) {
      throw new Error("PostgreSQL deleteRows must be called within an active transaction.");
    }

    try {
      const clauses: string[] = [];
      const values: any[] = [];
      let valCounter = 1;

      for (const c of conditions) {
        const colName = `"${c.column}"`;
        const op = c.operator.toUpperCase();

        if (op === "IN") {
          const placeholders = c.value.map(() => `$${valCounter++}`).join(", ");
          clauses.push(`${colName} IN (${placeholders})`);
          values.push(...c.value);
        } else if (op === "BETWEEN") {
          clauses.push(`${colName} BETWEEN $${valCounter++} AND $${valCounter++}`);
          values.push(c.value[0], c.value[1]);
        } else {
          clauses.push(`${colName} ${c.operator} $${valCounter++}`);
          values.push(c.value);
        }
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const sql = `DELETE FROM "${tableName}" ${whereClause}`;

      await this.txClient.query(sql, values);
    } catch (error: any) {
      throw new Error(`PostgreSQL deleteRows failed for table ${tableName}: ${error.message}`);
    }
  }

  async upsertBatch(tableName: string, rows: any[], upsertKeys: string[]): Promise<void> {
    if (!this.txClient) {
      throw new Error("PostgreSQL upsertBatch must be called within an active transaction.");
    }
    if (rows.length === 0) return;

    try {
      const columns = Object.keys(rows[0]);
      const quotedColumns = columns.map((col) => `"${col}"`).join(", ");

      let valCounter = 1;
      const rowPlaceholder = `(${columns.map(() => `$${valCounter++}`).join(", ")})`;
      const allPlaceholders = rows.map(() => rowPlaceholder).join(", ");

      const updateColumns = columns.filter((col) => !upsertKeys.includes(col));
      const quotedUpsertKeys = upsertKeys.map((k) => `"${k}"`).join(", ");

      let conflictClause = "";
      if (updateColumns.length > 0) {
        conflictClause = `ON CONFLICT (${quotedUpsertKeys}) DO UPDATE SET ` + updateColumns
          .map((col) => `"${col}" = EXCLUDED."${col}"`)
          .join(", ");
      } else {
        conflictClause = `ON CONFLICT (${quotedUpsertKeys}) DO NOTHING`;
      }

      const sql = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${allPlaceholders} ${conflictClause}`;
      const values = rows.flatMap((row) => columns.map((col) => row[col]));

      await this.txClient.query(sql, values);
    } catch (error: any) {
      throw new Error(`PostgreSQL upsertBatch failed for table ${tableName}: ${error.message}`);
    }
  }

  /**
   * Translates query :paramName variables to PostgreSQL positional $1, $2 variables.
   */
  private translateNamedParameters(
    query: string,
    params: { name: string; value: any }[]
  ): { sql: string; values: any[] } {
    const paramMap = new Map(params.map((p) => [p.name, p.value]));
    const values: any[] = [];
    let counter = 1;

    const translatedSql = query.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
      if (paramMap.has(paramName)) {
        values.push(paramMap.get(paramName));
        return `$${counter++}`;
      }
      return match;
    });

    return { sql: translatedSql, values };
  }

  private ensurePool(): void {
    if (!this.pool) {
      throw new Error("Database adapter is not connected. Call connect() first.");
    }
  }
}
