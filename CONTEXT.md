# CONTEXT.md

This file gives AI coding agents (including Antigravity 2.0) a high-level understanding of what **DataBridge** is and why it exists, before diving into implementation details. For enforceable coding rules, see `AGENTS.md`. For the complete, detailed project report, see `reference/DataBridge_Project_Report.md`.

## What Is DataBridge?

DataBridge is a command-line program, distributed as a single compiled executable (`.exe` on Windows, native binary on Linux), that migrates or synchronizes data from one database table to another database table. It is designed to replace ad-hoc, one-off TypeScript/Node.js scripts that were previously written per data-migration task.

## The Problem It Solves

Before DataBridge, each data migration/sync task required writing a new ad-hoc script. This had three major drawbacks:

1. Any change in table, condition, or database required editing code directly.
2. Node.js and its dependencies had to be installed on every machine that needed to run a migration.
3. There was no standardized, reusable way to handle retries, batching, or transactional safety across different tasks.

## Goals

- Provide one flexible program whose behavior is fully controlled through external config files — no code changes needed per task.
- Compile to a single executable that requires no runtime installation on the target machine.
- Support multiple database vendors (MySQL/MariaDB, MSSQL, PostgreSQL) on both source and target sides, in any combination.
- Handle very large tables (hundreds of GB) without memory issues, via streaming and batching.

## Scope

- One CLI program running on Windows and Linux.
- One `config.json` file describes exactly one source table → one target table migration ("1 config = 1 table pair"). Multiple configs mean multiple separate runs.
- Source queries are raw SQL, written entirely by the user (no query builder).
- All columns returned by the source query are copied as-is to the target — no column renaming or transformation.

## Explicitly Out of Scope

The following were deliberately excluded to keep the tool focused and simple. Do not implement these unless the user explicitly requests it:

- No GUI — command-line only.
- No built-in scheduler — users configure Task Scheduler (Windows) or cron (Linux) externally.
- No dry-run mode.
- No credential encryption in config files (internal-company use only; accepted risk).
- No data mapping/transformation between source and target column names or types.
- No multi-table support within a single config file.
- No safety guard against abnormally large query result sets — the user is responsible for writing appropriately scoped queries.

## Target Users

- **End users:** Technical/IT staff across multiple teams/departments within the organization, comfortable with CLI tools and editing config files directly.
- **System administrators:** A central IT team responsible for building and distributing the compiled binary. Each individual team manages its own `config.json` files for its own migration tasks.

## Core Behavior at a Glance

- Behavior is split across two files: `.env` (connection settings + execution behavior, e.g. batch size, retry policy, write mode) and `config.json` (task-specific logic, e.g. source/target database, table, SQL query, delete conditions).
- Four write modes are supported: `insertOnly`, `deleteThenInsert`, `upsert`, `truncateThenInsert`.
- All writes to the target happen inside a single database transaction spanning the entire table for that run, ensuring all-or-nothing safety.
- Data is streamed from the source using cursor-based batching (controlled by `BATCH_SIZE`) to keep memory usage constant regardless of table size.
- Failed operations are retried automatically according to `MAX_RETRIES` and `RETRY_BACKOFF` before the transaction is rolled back.
- `configVersion` in `config.json` must match what the compiled binary supports; a mismatch causes an immediate, clear error and the program stops — it never proceeds with a warning.

## Where to Look for More Detail

- **Enforceable coding rules and architecture standards:** `AGENTS.md`
- **Full project report (requirements, architecture diagrams, workflow, config schema, risks, roadmap):** `reference/DataBridge_Project_Report.md`
- **Version history and schema changes:** `CHANGELOG.md`
- **Step-by-step procedures for recurring tasks:** `.agents/skills/`
- **One-time guides (e.g. onboarding a new team):** `.agents/workflows/`
