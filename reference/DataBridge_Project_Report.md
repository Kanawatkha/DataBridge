# Project Architecture Report — DataBridge

**Document type:** Reference report for AI coding agents (Antigravity 2.0) and human developers.
**Author:** Kanawat Khamtho
**Last updated:** 2026-07-17

This document is the full, detailed reference for the DataBridge project. For enforceable coding rules, see `AGENTS.md`. For a quick high-level overview, see `CONTEXT.md`.

---

## 0. Project Overview

### 0.1 Project Name and Problem Statement

**Project name:** DataBridge

The organization regularly needs to migrate/sync data between two databases (e.g. from a branch database to a central database). The tables, conditions, and source/target databases involved can change from task to task. Previously, this was handled with ad-hoc TypeScript/Node.js scripts written per task — inflexible, requiring code changes for every new table or condition, and requiring Node.js and its dependencies to be installed on every machine used.

### 0.2 Goals

- Build one flexible central program whose entire behavior is controlled via external config files, with no code changes required.
- Compile to a single `.exe`, easy to distribute, requiring no additional runtime installation on the target machine.
- Support multiple database vendors (multi-vendor).
- Support very large data volumes (hundreds of GB per table) without memory issues.

### 0.3 Scope

- CLI program (`.exe`) running on Windows and Linux.
- Migrates data from one source table to one target table per run (1 config file = 1 task).
- Supports MySQL/MariaDB, MSSQL, and PostgreSQL on both source and target sides (any combination allowed).
- Source-side query is raw SQL, fully written by the user (no query builder).
- Copies every column returned by the query as-is (no filtering or renaming of columns along the way).

### 0.4 Out of Scope

Deliberately excluded from this version:

- No GUI (Graphical User Interface) — CLI only.
- No built-in automatic scheduling (users configure Task Scheduler/cron externally if needed).
- No dry-run mode.
- No encryption of credentials in config files.
- No mapping/transform system for renaming columns or converting schema between source and target.
- No support for multiple tables within a single config file (1 config = 1 table pair).
- No safety guard warning when a query returns an abnormally large result set.

### 0.5 Target User Groups

- **End users:** Technical/IT staff across multiple teams/departments in the organization, comfortable with CLI tools and able to edit config files themselves.
- **System administrators:** A central IT team responsible for building and distributing the `.exe` to all teams; each team manages its own config for its own tasks.

### 0.6 Full Requirement Checklist Summary

| Category | Item | Decision |
|---|---|---|
| Packaging | Method to compile to `.exe` | Bun compile |
| OS Support | Windows + Linux | Cross-platform build |
| DB Support | Database types | MySQL/MariaDB, MSSQL, PostgreSQL (multi-vendor via adapter pattern) |
| Data Size | Per table | Hundreds of GB — must stream/batch |
| Users | Skill level | Tech/IT — able to use CLI |
| Execution | Mode | Manual/on-demand only |
| Config split | `.env` vs `config.json` | `.env` = connection only, `config.json` = database/table/query/logic |
| Query | Format | Full raw SQL, user-written |
| Parameters | Source | Fixed values in config only (`.exe` does not accept additional runtime input) |
| Tables per config | Scope | 1 config = 1 table pair (no jobs array) |
| Write Mode | Options | insertOnly, deleteThenInsert, upsert, truncateThenInsert |
| Delete Condition | Structure | Flat array, implicit AND, full operator support |
| Transaction | Scope | Covers the entire table per run (delete+insert atomic, rollback supported) |
| Mapping/Transform | Decision | Excluded — copies every column exactly as returned by the query |
| Param Reference | Mechanism | `$ref:paramName` references a value from `source.params` into `target.deleteCondition` |
| Streaming | Method | Cursor-based streaming by `BATCH_SIZE`, no safety guard |
| Retry | Strategy | Exponential backoff, configurable attempt count (`MAX_RETRIES`) |
| Concurrency | Level | Batch-level only, configured via `BATCH_CONCURRENCY_LIMIT` (no job-level concurrency, since 1 config = 1 table pair) |
| Validation | Pre-check | Present — checks connection + table existence before running |
| Config Version Check | Behavior on mismatch | Immediate error, stops execution (fail-safe); never proceeds with a warning |
| Graceful Shutdown | Behavior | Catches interrupt signal (Ctrl+C) → rollback + log "cancelled by user" |
| Logging | Format | Log file rotated daily |
| Versioning | Command | Has `--version` to display version number |
| Credential Security | Encryption | Not required (internal organization use only) |
| Distribution | Method | Central team builds once, distributes the same file to all teams |
| Deliverables | List | `DataBridge.exe`, `.env`, `config.json`, `README.md` (Thai language) |

---

## 1. Tech Stack

All technology choices are guided by the need to compile easily into a cross-OS single binary and to minimize the risk of native dependency issues when supporting multiple database vendors simultaneously.

| Tool | Role | Rationale |
|---|---|---|
| Bun (compile) | Runtime + compiler for producing a single `.exe` | The previously popular tool (Vercel's `pkg`) has been deprecated and no longer supports newer Node versions. The two remaining actively maintained, professionally used options are Bun compile and Node.js SEA (Single Executable Applications). Bun compile was chosen because it supports cross-compilation across OSes (Windows/Linux) from a single machine more easily than Node SEA, which requires building separately per OS. |
| TypeScript | Primary development language | Builds on the team's existing expertise; type safety reduces bugs from handling multiple DB vendors concurrently. |
| Per-vendor DB driver | Connects to each database type | Pure-JavaScript drivers are chosen for each DB vendor (MySQL/MariaDB, MSSQL, PostgreSQL) to avoid native binding issues that could complicate single-binary compilation. |
| Adapter Pattern (design pattern) | Code structure for multi-DB support | A shared interface (e.g. `IDatabaseAdapter`) with per-vendor implementations, so new DB types can be added in the future without affecting other parts of the code. |

---

## 2. System Architecture

### 2.1 Design Principles

Designed from scratch; does not reuse the folder structure of the team's previous project (NSS-SC-DB-SEEDER) — that project is referenced only as a conceptual guide for "task shape."

### 2.2 High-Level Components

1. **Config Loader** — loads and validates both `.env` and `config.json` (including `configVersion` checks).
2. **Pre-check Validator** — verifies connectivity and table existence before the real task begins.
3. **Database Adapter Layer** — the middle layer translating central logic into vendor-specific commands.
4. **Query Execution Engine** — runs the source query via cursor-based streaming.
5. **Write Strategy Handler** — manages all 4 write modes (insertOnly, deleteThenInsert, upsert, truncateThenInsert).
6. **Transaction Manager** — controls the transaction spanning the whole table per run, with rollback support.
7. **Retry Handler** — manages retries using exponential backoff.
8. **Logger** — writes daily-rotated log files.
9. **CLI Entry Point** — program entry, accepts arguments like `--config=path`, `--version`.

### 2.3 High-Level Data Flow

```
Source Database (MySQL/MariaDB/MSSQL/PostgreSQL)
        |  (Raw SQL query, cursor-based streaming)
        v
   DataBridge.exe
   - Config Loader (.env + config.json + configVersion check)
   - Pre-check Validator
   - Database Adapter Layer
   - Write Strategy Handler + Transaction Manager
   - Retry Handler + Logger
        |  (batch insert per BATCH_SIZE within a single transaction)
        v
Target Database (MySQL/MariaDB/MSSQL/PostgreSQL)
```

### 2.4 System Architecture Diagram

The diagram shows three main boxes arranged left to right: Source Database, DataBridge.exe (expanded to show the 9 internal components), and Target Database, with arrows indicating data flow direction — cursor streaming on the left side, batch insert within a transaction on the right side.

*(See the original report's diagram assets for the visual architecture and flowchart images.)*

---

## 3. Workflow / Execution Flow

Sequence of program execution from start to finish:

1. The user runs `DataBridge.exe --config=./config.json` (or `--version` to view the version).
2. The program loads the `.env` file (connection settings + execution behavior).
3. The program loads the specified `config.json` (logic: source/target database, table, query, condition).
4. The program checks whether the `configVersion` in `config.json` matches the version supported by the `.exe`. If there is a mismatch, this is treated as an immediate error — the program displays a message stating the found version versus the supported version, then stops immediately (it never proceeds with a warning), to prevent damage from mismatched schema.
5. **Pre-check Validation:** verifies that both source and target databases are reachable and that the specified tables exist. If this fails, the program shows a clear, readable error explaining the cause, then stops immediately (no data is modified in this case).
6. Opens a transaction on the target database.
7. Checks `WRITE_MODE` set in `.env`: if `deleteThenInsert`, runs a delete command on the target according to `deleteCondition` first (supporting `$ref:paramName`); if `truncateThenInsert`, deletes all data in the target table; if `insertOnly` or `upsert`, skips the delete step.
8. Runs the source query (raw SQL) via cursor-based streaming, pulling data in batches sized by `BATCH_SIZE`.
9. For each batch retrieved, immediately inserts (or upserts, based on `upsertKeys`) into the target table — it does not wait for the query to finish reading all data first.
10. If an error occurs at any step, the program retries according to the count in `MAX_RETRIES`, using the wait pattern defined in `RETRY_BACKOFF` (exponential or fixed).
11. If retries are exhausted without success, the entire transaction is rolled back, and a detailed error log is recorded.
12. If all batches succeed, the transaction is committed.
13. If the user presses Ctrl+C or otherwise interrupts the program mid-run, the program catches the signal, attempts to safely roll back the transaction, and logs "cancelled by user."
14. Records the full run result (success/failure, number of rows processed, time taken) to the daily log file.

### 3.1 Flowchart

The flowchart shows a decision-flow diagram starting at Start, proceeding through Load `.env`, Load `config.json`, checking `configVersion` (with a branch for mismatch leading to an error display with version details and program termination), Pre-check Validation (with a branch for failure leading to error display and termination), Open Transaction, checking `WRITE_MODE` (branching into 4 sub-paths per mode), Stream Query + Batch Insert (with a loop over batches and a branch to the Retry Handler on error), Commit or Rollback, writing the Log, and End — with a special branch from every point where a transaction is open back to Rollback + Log "cancelled by user" if a Ctrl+C signal is received.

*(See the original report's diagram assets for the visual flowchart.)*

---

## 4. Config File Structure (.env and config.json)

### 4.1 .env — Connection and Execution Settings

| Field | Description |
|---|---|
| `SOURCE_DB_TYPE` | Source database type (mysql / mssql / postgresql) |
| `SOURCE_DB_HOST` | Source database host/endpoint |
| `SOURCE_DB_PORT` | Connection port |
| `SOURCE_DB_USER` | Username |
| `SOURCE_DB_PASSWORD` | Password |
| `SOURCE_DB_CONNECTION_LIMIT` | Maximum connections in the pool |
| `TARGET_DB_TYPE` / `HOST` / `PORT` / `USER` / `PASSWORD` / `CONNECTION_LIMIT` | Same as source, but for the target database |
| `CONFIG_FILE_PATH` | Path to the `config.json` file used for this run |
| `WRITE_MODE` | Write mode: insertOnly / deleteThenInsert / upsert / truncateThenInsert |
| `BATCH_SIZE` | Number of rows per batch during streaming/insert |
| `MAX_RETRIES` | Maximum retry attempts on error |
| `RETRY_BACKOFF` | Retry wait pattern: exponential or fixed |
| `MAX_EXECUTION_TIME_HOURS` | Maximum allowed run time per execution |
| `BATCH_CONCURRENCY_LIMIT` | Number of batches processed concurrently at the connection pool level (the only concurrency setting in the system — see Section 5.6 for rationale) |
| `PRECHECK_ENABLED` | Enable/disable pre-run validation |
| `PRECHECK_CHECK_CONNECTION` | Verify source/target connectivity |
| `PRECHECK_CHECK_TABLE_EXISTS` | Verify source/target table existence |
| `LOG_DIR` | Log file output directory |
| `LOG_LEVEL` | Log level: debug / info / warn / error |
| `NODE_ENV` | Runtime environment (dev/production) |

**Full example `.env` file:**

```
# ============================================
# DataBridge Configuration - Connection & System
# ============================================

# --- Source Database ---
SOURCE_DB_TYPE=mysql
SOURCE_DB_HOST=your-source-host.example.com
SOURCE_DB_PORT=3306
SOURCE_DB_USER=admin
SOURCE_DB_PASSWORD=your_password_here
SOURCE_DB_CONNECTION_LIMIT=10

# --- Target Database ---
TARGET_DB_TYPE=mssql
TARGET_DB_HOST=your-target-host.example.com
TARGET_DB_PORT=1433
TARGET_DB_USER=admin
TARGET_DB_PASSWORD=your_password_here
TARGET_DB_CONNECTION_LIMIT=10

# --- Config File Reference ---
CONFIG_FILE_PATH=./config.json

# --- Execution Behavior ---
WRITE_MODE=deleteThenInsert
BATCH_SIZE=500
MAX_RETRIES=5
RETRY_BACKOFF=exponential
MAX_EXECUTION_TIME_HOURS=20

# --- Concurrency (Batch-level only) ---
BATCH_CONCURRENCY_LIMIT=4

# --- Pre-check (Validation) ---
PRECHECK_ENABLED=true
PRECHECK_CHECK_CONNECTION=true
PRECHECK_CHECK_TABLE_EXISTS=true

# --- Logging ---
LOG_DIR=./logs
LOG_LEVEL=info

# --- Environment ---
NODE_ENV=production
```

### 4.2 config.json — Database/Table/Query/Logic

| Field | Description |
|---|---|
| `configVersion` | The config schema version, used to check compatibility with the `.exe`. If mismatched, the program shows an error stating the found version versus the supported version and stops immediately (never proceeds with a warning). |
| `description` | A short description of what this task does. |
| `source.database` | Source database name. |
| `source.table` | Source table name. |
| `source.query` | Raw SQL query for fetching data. |
| `source.params` | List of parameters bound to the query; each has `name`, `type` (string/number/date), `value`. |
| `target.database` | Target database name. |
| `target.table` | Target table name. |
| `target.deleteCondition.conditions` | List of conditions for deleting data (used when `WRITE_MODE = deleteThenInsert`); each condition has `column`, `operator`, `value`, supporting `$ref:paramName`. |
| `target.upsertKeys` | List of columns used as the key for checking upsert (used when `WRITE_MODE = upsert`). |

**Full example `config.json` file:**

```json
{
  "configVersion": "1.0",
  "description": "Migrate ITEM_BASIC data by storeId and updateDate",

  "source": {
    "database": "master",
    "table": "ITEM_BASIC",
    "query": "SELECT * FROM ITEM_BASIC WHERE storeId = :storeId AND updateDate = :updateDate",
    "params": [
      { "name": "storeId", "type": "string", "value": "12345" },
      { "name": "updateDate", "type": "date", "value": "20260606" }
    ]
  },

  "target": {
    "database": "commons",
    "table": "ITEM_BASIC",
    "deleteCondition": {
      "conditions": [
        { "column": "STORE_ID", "operator": "=", "value": "$ref:storeId" },
        { "column": "UPDATE_DATE", "operator": "<", "value": "20260717" }
      ]
    },
    "upsertKeys": []
  }
}
```

**Supported operators in conditions:** `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `BETWEEN`, `LIKE`

**Special operator examples:**

```json
{ "column": "STORE_ID", "operator": "IN", "value": ["12345", "12346"] }
{ "column": "UPDATE_DATE", "operator": "BETWEEN", "value": ["20260601", "20260717"] }
```

### 4.3 Deliverable Package for End Users

```
DataBridge-v1.0/
├── DataBridge.exe          <- Main program (Windows build) or DataBridge (Linux build)
├── .env                    <- Connection/system settings
├── config.json             <- Task-specific migration logic
└── README.md               <- User manual (Thai language)
```

Files generated during runtime (not part of the distributed package): `logs/` folder containing daily-rotated log files.

---

## 5. Data Handling

### 5.1 The 4 Write Modes

| Write Mode | Behavior | Uses deleteCondition? |
|---|---|---|
| `insertOnly` | Inserts new data directly; does not touch existing data. | No (if provided, it is ignored with a log warning) |
| `deleteThenInsert` | Deletes data per `deleteCondition` first, then inserts all new data. | Yes (required) |
| `upsert` | Checks via `upsertKeys`; updates if exists, inserts if not. | No (uses `upsertKeys` instead) |
| `truncateThenInsert` | Deletes all data in the table unconditionally, then inserts all new data. | No (already deletes the whole table) |

### 5.2 Transaction Strategy

Delete and insert operations always occur within the same transaction (except in `insertOnly` mode, which has no delete step), spanning the entire table per run. If any step fails after exhausting retries, everything is rolled back to the state before the task started, preventing data from being left in a partially-deleted, partially-written state.

**Trade-off note:** Because the transaction spans the entire table, very large data volumes (hundreds of GB) may cause the database's transaction/undo log to grow significantly and may cause long table locks during the run. This trade-off is accepted in exchange for all-or-nothing data safety.

### 5.3 Retry Strategy

When an error occurs during the run (e.g. a dropped connection), the program automatically retries up to `MAX_RETRIES` times, using `RETRY_BACKOFF`:

- **exponential:** wait time increases exponentially each attempt (e.g. 1s → 2s → 4s → 8s → 16s), reducing pressure on a system that is already having issues.
- **fixed:** waits the same amount of time every attempt.

### 5.4 Streaming/Batch Strategy

Uses cursor-based streaming via each database's driver, reading data batch by batch according to `BATCH_SIZE`, then inserting immediately without waiting for the query to finish reading all data — keeping memory usage constant regardless of result set size. Simple `OFFSET`/`LIMIT` is not used, as it becomes progressively slower with large data volumes. The program does not warn or restrict abnormally large query result sets — the user is responsible for writing queries with appropriately scoped conditions.

### 5.5 Parameter Reference Mechanism ($ref:)

To reduce the risk of duplicated values between source query params and target `deleteCondition` (e.g. `storeId` must match on both sides), the system supports cross-section value references using the `$ref:paramName` syntax in `deleteCondition` values. The program automatically substitutes the actual value from the matching-named entry in `source.params` at runtime. Conditions unrelated to source params can still specify constant values directly as usual.

### 5.6 Concurrency Model

The system has exactly one level of concurrency control: batch-level, via the `BATCH_CONCURRENCY_LIMIT` field in `.env`, which determines how many batches can be processed concurrently at the connection-pool level within a single run.

Early in the design process, there was a concept of "job-level concurrency," from when a config structure supporting multiple jobs within a single file (a `jobs` array) was still being considered. At that time, job-level concurrency had a clear meaning: limiting how many jobs within a single config could run concurrently. After deciding to scope the project as "1 config = 1 table pair" (no `jobs` array), this concept lost its original meaning, since there are no longer multiple jobs to control within a single config file.

The concept of "limiting how many `.exe` instances can run concurrently system-wide" was also not implemented as a program field, since each team runs its own `.exe` instance independently (distributing the same binary but with different configs per team's tasks). Limiting at this cross-instance, cross-team level is not an appropriate responsibility for a single program to control. If this level of limiting is needed in the future, it should be handled by an external mechanism (e.g. organization-level scheduling allocation) instead.

---

## 6. Operations

### 6.1 Logging

Log files are stored with daily rotation (e.g. `logs/2026-07-17.log`), recording every step of execution in detail: pre-check results, number of rows processed, errors encountered (including retry attempts), and the final result (success/failure/cancelled by user).

### 6.2 Graceful Shutdown

The program catches cancellation signals (e.g. Ctrl+C, SIGINT/SIGTERM) while a transaction is open, attempts to safely roll back the transaction before exiting, and logs clearly that it was "cancelled by user," distinguishing this from other error cases.

### 6.3 Versioning

The program has a `--version` command showing the current `.exe` version, allowing the central team and users to check which teams are on older/newer versions — aiding debugging and updates. This version is also compared against the `configVersion` specified in `config.json` (see Sections 3 and 4.2).

### 6.4 Build and Distribution

The central IT team is responsible for building the program with Bun compile for both Windows and Linux, then distributing the package (`.exe` + example `.env` + example `config.json` + `README.md`) for each team to adapt for its own tasks — without needing to ask the central team to rebuild every time the task changes (except when actually updating to a new program version).

### 6.5 README.md

Written entirely in Thai, explaining installation, how to edit each config field and its meaning, example commands, and how to read logs when issues arise.

---

## 7. Risks and Trade-offs

| Risk/Limitation | Details | Reason Accepted |
|---|---|---|
| Transaction spans the entire table | May cause the database's transaction/undo log to grow significantly and cause long table locks during large data runs. | Traded for all-or-nothing data safety, preventing data from being left in a partially-deleted, partially-written state. |
| Checkpoint/Resume unavailable | Because the transaction spans the entire table, a failed run must be restarted entirely from the beginning — it cannot resume from a stalled batch. | A consequence of choosing full-table transactions for data safety. |
| Raw SQL has no enforced filtering | User-written queries may lack an appropriate WHERE clause, risking unintentionally pulling the entire table. | Provides maximum flexibility for users to write their own queries; users are responsible for query correctness. |
| No dry-run mode | Cannot simulate a run to preview results before executing for real. | Reduces MVP complexity; can be added in a future version. |
| Credentials not encrypted | Database passwords are stored as plain text in `.env`. | Used only within the internal organization; this risk is accepted for ease of installation and editing. |
| Multi-vendor driver compatibility | Some DB vendor drivers (e.g. MSSQL) may behave differently in parameter syntax or types compared to MySQL/PostgreSQL, requiring thorough testing across all vendors before production use. | Complexity inherent to supporting multi-vendor from the start, managed through the adapter pattern. |
| configVersion mismatch after a new release | If the central team releases a new `.exe` version that changes the config schema, teams still using an old `config.json` version will be unable to run immediately (error, execution stops) until they update `configVersion` and the file structure to match. | Follows the fail-safe principle, preventing data damage from mismatched schema — better than letting the program proceed by guessing at a potentially incorrect structure. |

---

## 8. Future Roadmap

Features out of scope for the first version but worth considering for future versions:

- **Dry-run Mode:** Simulate a run showing expected results (rows to be deleted/inserted) without modifying real data.
- **Multiple Tables per Config:** Change the structure to a `jobs` array to run multiple tasks within a single file (if job-level concurrency becomes needed again).
- **Credential Encryption:** Encrypt passwords in `.env` or support fetching from an external secret manager.
- **Data Mapping/Transform:** Support renaming columns or converting data types between source and target.
- **Checkpoint/Resume:** Record successfully completed points to allow resuming without restarting entirely (requires redesigning the transaction strategy).
- **Built-in Scheduler:** Add the ability to schedule automatic runs without relying on external Task Scheduler/cron.
- **Safety Guard for Large Queries:** Warn or halt execution if a query returns a result set exceeding a defined threshold.
- **Notifications/Alerts:** Send notifications (e.g. Slack, Email) on run success/failure.
