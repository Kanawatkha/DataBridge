# AGENTS.md

This file provides mandatory guidance for AI coding agents (including Antigravity 2.0) working on the **DataBridge** project. These rules apply to every session, regardless of the specific task being performed.

## 1. Project Summary

DataBridge is a CLI program (compiled to a single `.exe`) that migrates/syncs data between two databases (source → target). It supports MySQL/MariaDB, MSSQL, and PostgreSQL on both sides. Behavior is fully driven by external `.env` and `config.json` files — no hardcoded logic. See `CONTEXT.md` for the full project overview and `reference/DataBridge_Project_Report.md` for complete details.

## 2. Tech Stack

- **Language:** TypeScript (strict mode enabled)
- **Runtime/Compiler:** Bun (`bun build --compile`) for cross-platform single-binary output (Windows + Linux)
- **Database Drivers:** Pure-JavaScript drivers only, one per vendor (MySQL/MariaDB, MSSQL, PostgreSQL) — no native bindings, to preserve single-binary compilation
- **Design Pattern:** Adapter Pattern for all database vendor integrations

## 3. Build & Test Commands

- Install dependencies: `bun install`
- Run in dev mode: `bun run src/index.ts --config=./config.json`
- Type check: `bun run typecheck` (must pass with zero errors before any commit)
- Run tests: `bun test`
- Compile Windows binary: `bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile DataBridge.exe`
- Compile Linux binary: `bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile DataBridge`

Always run type check and tests before considering any code change complete.

## 4. Architecture & Coding Standards

These standards are mandatory for all code changes, regardless of task size.

### 4.1 Separation of Concerns (Layered Architecture)

Code must be organized into strictly separated layers. Never mix responsibilities across layers:

- **CLI/Entry Layer** — parses arguments (`--config`, `--version`), bootstraps the app. Contains no business logic.
- **Config Layer** — loads and validates `.env` and `config.json`, including `configVersion` checks. Contains no database or write-mode logic.
- **Adapter Layer** — one adapter class per database vendor, implementing a shared interface (e.g. `IDatabaseAdapter`). Contains no business logic beyond vendor-specific query execution.
- **Core/Domain Layer** — write-mode handling (insertOnly, deleteThenInsert, upsert, truncateThenInsert), transaction management, retry logic, batch streaming. Contains no vendor-specific code — must call adapters through the shared interface only.
- **Logging Layer** — structured logger, writes daily log files. Contains no business logic.

A single file must never combine two of these responsibilities (e.g. a file that both queries the database AND handles retry logic is not allowed — split it).

### 4.2 Dependency Injection

- Upper layers must receive dependencies (e.g. a database adapter instance) via constructor or function parameters.
- Never instantiate a concrete adapter class directly inside business logic (`new MySqlAdapter()` inside the Core layer is forbidden). Instead, inject an interface-typed dependency.
- This enables swapping database vendors and mocking dependencies in tests without modifying business logic.

### 4.3 No Hardcoding — Config-Driven Behavior

- Any value that can reasonably change between runs or environments MUST come from `.env` or `config.json`. This includes: batch size, retry count, retry backoff strategy, write mode, table names, database names, connection settings, log level, log directory.
- Magic numbers and magic strings related to business behavior are forbidden in source code.
- If a new configurable behavior is introduced, add a corresponding field to `.env` or `config.json` and document it — do not embed it directly in code.

### 4.4 Single Responsibility Per File

- Each file should have exactly one reason to change. For example: `retry-handler.ts` handles retries only; it must not also contain logging formatting logic.
- Favor small, focused files over large multi-purpose files.

### 4.5 Structured Logging

- Use a structured logging library (e.g. Pino or Winston) instead of raw `console.log`.
- All logs must support being written to daily-rotated files under `LOG_DIR`, respecting `LOG_LEVEL` from `.env`.

### 4.6 Strict TypeScript

- `strict: true` must remain enabled in `tsconfig.json` at all times.
- The `any` type is forbidden unless justified with an inline comment explaining why no other type is possible.

### 4.7 Centralized Error Handling

- All errors must flow through a centralized error-handling mechanism (e.g. a single error boundary at the CLI entry point) rather than being caught and handled inconsistently across the codebase.
- Errors that trigger a rollback (see `reference/DataBridge_Project_Report.md`, Section 5.2) must be clearly distinguishable from validation errors (Section 3, Pre-check Validation) and from user-cancellation events (Section 6.2, Graceful Shutdown).

## 5. Folder Structure

```
DataBridge/
├── AGENTS.md
├── CONTEXT.md
├── CHANGELOG.md
├── reference/
│   └── DataBridge_Project_Report.md
├── .agents/
│   ├── skills/
│   │   ├── add-database-adapter/SKILL.md
│   │   ├── release-build/SKILL.md
│   │   ├── config-authoring/SKILL.md
│   │   └── scaffold-new-module/SKILL.md
│   └── workflows/
│       └── onboard-new-team.md
├── src/
│   ├── cli/            # CLI entry layer
│   ├── config/         # Config loading & validation layer
│   ├── adapters/        # One folder/file per DB vendor, implementing IDatabaseAdapter
│   ├── core/            # Write-mode handlers, transaction manager, retry handler, batch streaming
│   └── logging/         # Structured logger setup
├── .env
├── config.json
└── README.md
```

## 6. Version Consistency Rule

- The `.exe` version (exposed via `--version`) and `configVersion` inside `config.json` are tightly coupled. Any change to the `config.json` schema MUST be accompanied by a `configVersion` bump and a corresponding `CHANGELOG.md` entry.
- Never allow the program to run with a mismatched `configVersion` — this must always fail fast with a clear error message (see `reference/DataBridge_Project_Report.md`, Section 3 and Section 7).

## 7. Out of Scope — Do Not Implement

Do not add the following unless explicitly instructed by the user, as they are intentionally excluded from this project (see `CONTEXT.md` for rationale):

- GUI interfaces
- Built-in scheduler (users rely on Task Scheduler/cron)
- Dry-run mode
- Credential encryption
- Data mapping/transform between source and target columns
- Multi-table configs (one `config.json` = one table pair only)

## 8. Collaboration Workflow

Follow these 3 steps strictly when working with the user (transitions between steps must be explicitly approved by the user):

1. **Discuss & Align** — Discuss requirements, propose design and technical approaches, and align with the user. Do not move to step 2 until the user explicitly directs you to.
2. **Propose Detailed File Plan** — List all files that will be created, modified, or restructured, explaining the planned changes for user review. Do not proceed to step 3 until the user explicitly approves this file plan.
3. **Generate Plan & Execute Immediately** — Once the user approves the detailed file plan from step 2, update or create `implementation_plan.md` and execute the code edits immediately in a single turn without waiting for plan approval.
