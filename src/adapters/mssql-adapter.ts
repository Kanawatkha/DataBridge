import sql from "mssql";
import type { IDatabaseAdapter } from "./database-adapter.interface";
import type { ConditionConfig } from "../config/task-config";

export class MssqlAdapter implements IDatabaseAdapter {
  private pool: sql.ConnectionPool | null = null;
  private tx: sql.Transaction | null = null;
  private options: any;

  constructor(options: any) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    this.pool = new sql.ConnectionPool({
      server: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      database: this.options.database,
      options: {
        encrypt: this.options.encrypt !== undefined ? this.options.encrypt : false,
        trustServerCertificate: true,
      },
      pool: {
        max: this.options.connectionLimit || 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    });

    await this.pool.connect();
  }

  async disconnect(): Promise<void> {
    if (this.tx) {
      this.tx = null;
    }
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    this.ensurePool();
    try {
      const request = new sql.Request(this.pool!);
      await request.query("SELECT 1");
      return true;
    } catch (error: any) {
      throw new Error(`MSSQL connection check failed: ${error.message}`);
    }
  }

  async tableExists(database: string, tableName: string): Promise<boolean> {
    this.ensurePool();
    try {
      const request = new sql.Request(this.pool!);
      const query = `
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_CATALOG = @db AND TABLE_NAME = @tbl
      `;
      request.input("db", sql.VarChar, database);
      request.input("tbl", sql.VarChar, tableName);
      const res = await request.query(query);
      return res.recordset.length > 0;
    } catch (error: any) {
      throw new Error(`MSSQL tableExists check failed for ${database}.${tableName}: ${error.message}`);
    }
  }

  async beginTransaction(): Promise<void> {
    this.ensurePool();
    if (this.tx) {
      throw new Error("A transaction is already active on this adapter.");
    }
    try {
      this.tx = new sql.Transaction(this.pool!);
      await this.tx.begin();
    } catch (error: any) {
      this.tx = null;
      throw new Error(`Failed to start MSSQL transaction: ${error.message}`);
    }
  }

  async commit(): Promise<void> {
    if (!this.tx) {
      throw new Error("No active transaction to commit.");
    }
    try {
      await this.tx.commit();
    } catch (error: any) {
      throw new Error(`Failed to commit MSSQL transaction: ${error.message}`);
    } finally {
      this.tx = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.tx) {
      return;
    }
    try {
      await this.tx.rollback();
    } catch (error: any) {
      throw new Error(`Failed to rollback MSSQL transaction: ${error.message}`);
    } finally {
      this.tx = null;
    }
  }

  async streamQuery(
    query: string,
    params: { name: string; type: string; value: any }[],
    batchSize: number,
    onBatch: (rows: any[]) => Promise<void>
  ): Promise<number> {
    this.ensurePool();

    // Use transaction if active, otherwise use pool
    const connectionSource = this.tx || this.pool!;
    const request = new sql.Request(connectionSource as any);
    request.stream = true;

    const translatedSql = this.prepareRequest(request, query, params);

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
            resolve(totalRows);
          } catch (err) {
            reject(err);
          }
        }
      };

      request.query(translatedSql);

      request.on("row", async (row) => {
        rowBuffer.push(row);
        totalRows++;

        if (rowBuffer.length >= batchSize) {
          request.pause();
          isProcessingBatch = true;
          try {
            await onBatch(rowBuffer);
            rowBuffer = [];
            isProcessingBatch = false;

            if (!isStreamEnded) {
              request.resume();
            } else {
              await checkEndState();
            }
          } catch (err) {
            reject(err);
          }
        }
      });

      request.on("error", (err) => {
        reject(new Error(`MSSQL streaming error: ${err.message}`));
      });

      request.on("done", async () => {
        isStreamEnded = true;
        await checkEndState();
      });
    });
  }

  async insertBatch(tableName: string, rows: any[]): Promise<void> {
    if (!this.tx) {
      throw new Error("MSSQL insertBatch must be called within an active transaction.");
    }
    if (rows.length === 0) return;

    try {
      // Create a native sql.Table object to perform a fast native bulk load.
      // This is highly efficient and bypasses the 2,100 parameters limit.
      const table = new sql.Table(tableName);

      const firstRow = rows[0];
      const columns = Object.keys(firstRow);

      columns.forEach((col) => {
        const val = firstRow[col];
        if (typeof val === "number") {
          table.columns.add(col, sql.Int, { nullable: true });
        } else if (val instanceof Date) {
          table.columns.add(col, sql.DateTime, { nullable: true });
        } else if (typeof val === "boolean") {
          table.columns.add(col, sql.Bit, { nullable: true });
        } else {
          table.columns.add(col, sql.VarChar(sql.MAX), { nullable: true });
        }
      });

      rows.forEach((row) => {
        table.rows.add(...columns.map((col) => row[col]));
      });

      const request = new sql.Request(this.tx!);
      await request.bulk(table);
    } catch (error: any) {
      throw new Error(`MSSQL insertBatch bulk insert failed for ${tableName}: ${error.message}`);
    }
  }

  async deleteRows(tableName: string, conditions: ConditionConfig[]): Promise<void> {
    if (!this.tx) {
      throw new Error("MSSQL deleteRows must be called within an active transaction.");
    }

    try {
      const request = new sql.Request(this.tx!);
      const clauses: string[] = [];
      let valCounter = 0;

      for (const c of conditions) {
        const colName = `[${c.column}]`;
        const op = c.operator.toUpperCase();
        
        if (op === "IN") {
          const paramNames: string[] = [];
          c.value.forEach((val: any) => {
            const pName = `del_param_${valCounter++}`;
            request.input(pName, val);
            paramNames.push(`@${pName}`);
          });
          clauses.push(`${colName} IN (${paramNames.join(", ")})`);
        } else if (op === "BETWEEN") {
          const pName1 = `del_param_${valCounter++}`;
          const pName2 = `del_param_${valCounter++}`;
          request.input(pName1, c.value[0]);
          request.input(pName2, c.value[1]);
          clauses.push(`${colName} BETWEEN @${pName1} AND @${pName2}`);
        } else {
          const pName = `del_param_${valCounter++}`;
          request.input(pName, c.value);
          clauses.push(`${colName} ${c.operator} @${pName}`);
        }
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const sqlQuery = `DELETE FROM [${tableName}] ${whereClause}`;

      await request.query(sqlQuery);
    } catch (error: any) {
      throw new Error(`MSSQL deleteRows failed for table ${tableName}: ${error.message}`);
    }
  }

  async upsertBatch(tableName: string, rows: any[], upsertKeys: string[]): Promise<void> {
    if (!this.tx) {
      throw new Error("MSSQL upsertBatch must be called within an active transaction.");
    }
    if (rows.length === 0) return;

    const columns = Object.keys(rows[0]);
    
    // Chunk rows to bypass the MSSQL 2100 parameters limit for query binding.
    // Each row has 'columns.length' parameters.
    const maxParamsPerQuery = 2000;
    const chunkSize = Math.max(1, Math.floor(maxParamsPerQuery / columns.length));

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await this.executeUpsertChunk(tableName, chunk, columns, upsertKeys);
    }
  }

  private async executeUpsertChunk(
    tableName: string,
    rows: any[],
    columns: string[],
    upsertKeys: string[]
  ): Promise<void> {
    try {
      const request = new sql.Request(this.tx!);

      // Construct MERGE statement.
      // Build VALUES clauses
      const valueClauses: string[] = [];
      rows.forEach((row, rowIdx) => {
        const rowParamNames = columns.map((col, colIdx) => {
          const pName = `up_${rowIdx}_${colIdx}`;
          request.input(pName, row[col]);
          return `@${pName}`;
        });
        valueClauses.push(`(${rowParamNames.join(", ")})`);
      });

      const sourceColumns = columns.map((col) => `[${col}]`).join(", ");
      const mergeOnCondition = upsertKeys
        .map((k) => `Target.[${k}] = Source.[${k}]`)
        .join(" AND ");

      const updateColumns = columns.filter((col) => !upsertKeys.includes(col));
      
      let updateClause = "";
      if (updateColumns.length > 0) {
        updateClause = "WHEN MATCHED THEN UPDATE SET " + updateColumns
          .map((col) => `Target.[${col}] = Source.[${col}]`)
          .join(", ");
      }

      const targetColumns = columns.map((col) => `[${col}]`).join(", ");
      const insertValues = columns.map((col) => `Source.[${col}]`).join(", ");

      const sqlQuery = `
        MERGE [${tableName}] AS Target
        USING (VALUES ${valueClauses.join(", ")}) AS Source (${sourceColumns})
        ON (${mergeOnCondition})
        ${updateClause}
        WHEN NOT MATCHED THEN
          INSERT (${targetColumns}) VALUES (${insertValues});
      `;

      await request.query(sqlQuery);
    } catch (error: any) {
      throw new Error(`MSSQL upsertBatch failed for table ${tableName}: ${error.message}`);
    }
  }

  /**
   * Binds query parameters to the request and returns the translated query.
   */
  private prepareRequest(
    request: sql.Request,
    query: string,
    params: { name: string; value: any }[]
  ): string {
    params.forEach((p) => {
      request.input(p.name, p.value);
    });

    return query.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
      return `@${paramName}`;
    });
  }

  private ensurePool(): void {
    if (!this.pool) {
      throw new Error("Database adapter is not connected. Call connect() first.");
    }
  }
}
