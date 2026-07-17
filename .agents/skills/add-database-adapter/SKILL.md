---
name: add-database-adapter
description: Use this skill when adding support for a new database vendor (e.g. Oracle, SQLite) to DataBridge, or when modifying an existing vendor adapter. Ensures new vendors are integrated through the Adapter Pattern without affecting existing vendor code or the Core/Domain layer.
---

# Add Database Adapter

This skill guides the process of adding a new database vendor to DataBridge's Adapter Layer, or safely modifying an existing one, in a way that respects the layered architecture defined in `AGENTS.md`.

## When to Use This Skill

Trigger this skill when the user asks to:
- Add support for a new database type (e.g. "add Oracle support", "support SQLite as a target").
- Fix a bug in how an existing vendor (MySQL/MariaDB, MSSQL, PostgreSQL) adapter behaves.
- Investigate vendor-specific query/parameter/type differences.

## Prerequisites

Before starting, confirm:

1. A pure-JavaScript driver exists for the target vendor (no native bindings), per `AGENTS.md` Section 2 (Tech Stack) — native bindings break single-binary Bun compilation.
2. You have located the shared adapter interface (e.g. `IDatabaseAdapter`) inside `src/adapters/`.
3. You understand the current write modes and transaction behavior described in `reference/DataBridge_Project_Report.md`, Section 5.

## Steps

1. **Review the shared interface.** Read the existing `IDatabaseAdapter` interface (or equivalent) in `src/adapters/`. Identify every method the Core/Domain layer depends on (e.g. `connect`, `beginTransaction`, `commit`, `rollback`, `streamQuery`, `insertBatch`, `tableExists`, `checkConnection`).

2. **Create one new file per vendor.** Add a new file under `src/adapters/` (e.g. `src/adapters/oracle-adapter.ts`). Do not add vendor-specific logic to any existing adapter file or to the Core layer — this violates Single Responsibility (`AGENTS.md` Section 4.4).

3. **Implement the interface fully.** The new adapter class must implement every method of the shared interface. Map each method to the vendor's actual driver API, translating vendor-specific quirks (e.g. parameter placeholder syntax, type casting, cursor/streaming API) internally — these differences must never leak into the Core/Domain layer.

4. **Handle vendor-specific SQL differences internally.** Vendors differ in parameter binding syntax (e.g. named parameters vs positional `?`), identifier quoting, and batch insert syntax. All of this translation logic belongs inside the adapter file, never inside `src/core/`.

5. **Register the adapter.** Locate the adapter factory/registry (the single place responsible for mapping a `DB_TYPE` string to an adapter class, per `SOURCE_DB_TYPE`/`TARGET_DB_TYPE` in `.env`). Register the new adapter there. Do not hardcode vendor selection anywhere else — this violates the No-Hardcode rule (`AGENTS.md` Section 4.3).

6. **Respect Dependency Injection.** The Core/Domain layer must receive the adapter instance via injection, never instantiate a concrete adapter class directly (`AGENTS.md` Section 4.2). Verify no new `new XyzAdapter()` calls were introduced outside the registry/factory.

7. **Add/update tests.** Write unit tests for the new adapter in isolation (mocking the underlying driver), and integration tests exercising it through the Core/Domain layer using the shared interface, following existing test patterns in the project.

8. **Verify no regression.** Run `bun run typecheck` and `bun test` to confirm existing vendor adapters (MySQL/MariaDB, MSSQL, PostgreSQL) are unaffected.

## Verification Checklist

- [ ] New adapter file implements the full shared interface, no partial implementation.
- [ ] No vendor-specific logic leaked into `src/core/` or other adapter files.
- [ ] Adapter is registered in the factory/registry only — no hardcoded vendor branching elsewhere.
- [ ] Core/Domain layer still receives adapters via dependency injection.
- [ ] `bun run typecheck` passes with zero errors.
- [ ] `bun test` passes, including tests for the new adapter and all existing adapters.
- [ ] If the new vendor requires a new `.env` value for `SOURCE_DB_TYPE`/`TARGET_DB_TYPE`, this is documented (do not hardcode the new type string anywhere except the registry).

## Related References

- `AGENTS.md` — Section 4.1 (Separation of Concerns), 4.2 (Dependency Injection), 4.3 (No Hardcoding)
- `reference/DataBridge_Project_Report.md` — Section 1 (Tech Stack), Section 2.2 (Database Adapter Layer), Section 7 (Multi-vendor driver compatibility risk)
