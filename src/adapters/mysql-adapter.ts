import mysql from "mysql2/promise";
import type { IDatabaseAdapter } from "./database-adapter.interface";
import type { ConditionConfig } from "../config/task-config";

export class MySqlAdapter implements IDatabaseAdapter {
  private pool: mysql.Pool | null = null;
  private txConnection: mysql.PoolConnection | null = null;
  private options: any;

  constructor(options: any) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    this.pool = mysql.createPool({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      database: this.options.database,
      connectionLimit: this.options.connectionLimit || 10,
    });
  }

  async disconnect(): Promise<void> {
    if (this.txConnection) {
      this.txConnection.release();
      this.txConnection = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    this.ensurePool();
    let conn: mysql.PoolConnection | null = null;
    try {
      conn = await this.pool!.getConnection();
      await conn.ping();
      return true;
    } catch (error: any) {
      throw new Error(`MySQL connection check failed: ${error.message}`);
    } finally {
      if (conn) conn.release();
    }
  }

  async tableExists(database: string, tableName: string): Promise<boolean> {
    this.ensurePool();
    let conn: mysql.PoolConnection | null = null;
    try {
      conn = await this.pool!.getConnection();
      const sql = `
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = ? 
        LIMIT 1
      `;
      const [rows] = await conn.query(sql, [database, tableName]);
      return Array.isArray(rows) && rows.length > 0;
    } catch (error: any) {
      throw new Error(`MySQL tableExists check failed for ${database}.${tableName}: ${error.message}`);
    } finally {
      if (conn) conn.release();
    }
  }

  async beginTransaction(): Promise<void> {
    this.ensurePool();
    if (this.txConnection) {
      throw new Error("A transaction is already active on this adapter.");
    }
    try {
      this.txConnection = await this.pool!.getConnection();
      await this.txConnection.beginTransaction();
    } catch (error: any) {
      if (this.txConnection) {
        this.txConnection.release();
        this.txConnection = null;
      }
      throw new Error(`Failed to start MySQL transaction: ${error.message}`);
    }
  }

  async commit(): Promise<void> {
    if (!this.txConnection) {
      throw new Error("No active transaction to commit.");
    }
    try {
      await this.txConnection.commit();
    } catch (error: any) {
      throw new Error(`Failed to commit MySQL transaction: ${error.message}`);
    } finally {
      this.txConnection.release();
      this.txConnection = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.txConnection) {
      // If no active transaction, silently return or log (helps with double rollbacks)
      return;
    }
    try {
      await this.txConnection.rollback();
    } catch (error: any) {
      throw new Error(`Failed to rollback MySQL transaction: ${error.message}`);
    } finally {
      this.txConnection.release();
      this.txConnection = null;
    }
  }

  async streamQuery(
    query: string,
    params: { name: string; type: string; value: any }[],
    batchSize: number,
    onBatch: (rows: any[]) => Promise<void>
  ): Promise<number> {
    this.ensurePool();
    const connection = await this.pool!.getConnection();

    try {
      const { sql, values } = this.translateNamedParameters(query, params);
      
      // mysql2 requires using the legacy stream API from the underlying raw connection
      const stream = (connection.connection as any).query(sql, values).stream({ objectMode: true });

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
              connection.release();
              resolve(totalRows);
            } catch (err) {
              connection.release();
              reject(err);
            }
          }
        };

        stream.on("data", async (row: any) => {
          rowBuffer.push(row);
          totalRows++;

          if (rowBuffer.length >= batchSize) {
            // Apply backpressure by pausing stream
            stream.pause();
            isProcessingBatch = true;
            try {
              await onBatch(rowBuffer);
              rowBuffer = [];
              isProcessingBatch = false;
              
              // Only resume if the stream hasn't ended during the batch processing
              if (!isStreamEnded) {
                stream.resume();
              } else {
                await checkEndState();
              }
            } catch (err) {
              stream.destroy();
              connection.release();
              reject(err);
            }
          }
        });

        stream.on("error", (err: any) => {
          stream.destroy();
          connection.release();
          reject(new Error(`MySQL streaming error: ${err.message}`));
        });

        stream.on("end", async () => {
          isStreamEnded = true;
          await checkEndState();
        });
      });
    } catch (error: any) {
      connection.release();
      throw error;
    }
  }

  async insertBatch(tableName: string, rows: any[]): Promise<void> {
    if (!this.txConnection) {
      throw new Error("MySQL insertBatch must be called within an active transaction.");
    }
    if (rows.length === 0) return;

    try {
      const columns = Object.keys(rows[0]);
      const quotedColumns = columns.map((col) => `\`${col}\``).join(", ");
      const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`;
      const allPlaceholders = rows.map(() => rowPlaceholder).join(", ");

      const sql = `INSERT INTO \`${tableName}\` (${quotedColumns}) VALUES ${allPlaceholders}`;
      const values = rows.flatMap((row) => columns.map((col) => row[col]));

      await this.txConnection.execute(sql, values);
    } catch (error: any) {
      throw new Error(`MySQL insertBatch failed for table ${tableName}: ${error.message}`);
    }
  }

  async deleteRows(tableName: string, conditions: ConditionConfig[]): Promise<void> {
    if (!this.txConnection) {
      throw new Error("MySQL deleteRows must be called within an active transaction.");
    }

    try {
      const clauses: string[] = [];
      const values: any[] = [];

      for (const c of conditions) {
        const colName = `\`${c.column}\``;
        const op = c.operator.toUpperCase();

        if (op === "IN") {
          const placeholders = c.value.map(() => "?").join(", ");
          clauses.push(`${colName} IN (${placeholders})`);
          values.push(...c.value);
        } else if (op === "BETWEEN") {
          clauses.push(`${colName} BETWEEN ? AND ?`);
          values.push(c.value[0], c.value[1]);
        } else {
          clauses.push(`${colName} ${c.operator} ?`);
          values.push(c.value);
        }
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const sql = `DELETE FROM \`${tableName}\` ${whereClause}`;

      await this.txConnection.execute(sql, values);
    } catch (error: any) {
      throw new Error(`MySQL deleteRows failed for table ${tableName}: ${error.message}`);
    }
  }

  /**
   * Helper to translate named params (:paramName) to positional params (?)
   * and align values order correctly for node-mysql2 execution.
   */
  private translateNamedParameters(
    query: string,
    params: { name: string; value: any }[]
  ): { sql: string; values: any[] } {
    const paramMap = new Map(params.map((p) => [p.name, p.value]));
    const values: any[] = [];

    const translatedSql = query.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
      if (paramMap.has(paramName)) {
        values.push(paramMap.get(paramName));
        return "?";
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
