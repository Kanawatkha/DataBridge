---
name: config-authoring
description: Use this skill when creating or reviewing a config.json file for a new data migration task in DataBridge. Ensures the file matches the current configVersion schema, uses the correct write mode, and correctly wires deleteCondition, upsertKeys, and $ref: parameter references.
---

# Config Authoring

This skill guides the process of writing or reviewing a `config.json` file for a specific migration task, based on the schema defined in `reference/DataBridge_Project_Report.md`, Section 4.2.

## When to Use This Skill

Trigger this skill when the user asks to:
- Create a new `config.json` for a migration/sync task.
- Review or debug an existing `config.json` that is failing or behaving unexpectedly.
- Explain what a given `config.json` will do before it is run.

## Prerequisites

Before starting, confirm:

1. The current `configVersion` supported by the target `.exe` build (check the Config Loader in `src/config/` or the release notes in `CHANGELOG.md`).
2. The source and target database types, table names, and the exact business condition for the task (e.g. "migrate rows for storeId=12345 updated on 20260606").
3. Which `WRITE_MODE` the task needs (see decision guide in Step 2).

## Steps

1. **Set `configVersion` and `description`.** Always set `configVersion` to match the target `.exe` exactly — never guess or leave a stale value from a template. Write a short, specific `description` (e.g. "Migrate ITEM_BASIC data by storeId and updateDate"), not a generic placeholder.

2. **Choose the correct `WRITE_MODE`** (set in `.env`, not `config.json`, but must be decided before writing `deleteCondition`/`upsertKeys`):
   - `insertOnly` — target table is empty or append-only; no `deleteCondition` needed.
   - `deleteThenInsert` — target may already have rows for this exact condition scope that must be replaced; `deleteCondition` is REQUIRED.
   - `upsert` — target rows should be updated by key if they exist, inserted otherwise; `upsertKeys` is REQUIRED, `deleteCondition` is ignored.
   - `truncateThenInsert` — the entire target table should be wiped and replaced; no `deleteCondition` needed (the whole table is cleared).

3. **Write `source.query` as raw SQL.** Use named parameters (e.g. `:storeId`) matching entries in `source.params`. Never inline literal values directly into the query string — always bind them through `source.params` so they can be reused via `$ref:` in Step 5.

4. **Populate `source.params`.** Each entry needs `name`, `type` (`string`/`number`/`date`), and `value`. The `type` must match the actual column type to avoid driver-level casting errors.

5. **Write `target.deleteCondition.conditions` (if `WRITE_MODE = deleteThenInsert`).** Each condition needs `column`, `operator`, `value`. Conditions are combined with implicit AND.
   - Use `$ref:paramName` for any value that must stay in sync with a `source.params` entry (e.g. the same `storeId` used in the source query) — never duplicate the literal value manually, since a future edit to one side and not the other causes silent data mismatches.
   - Use a plain literal value only for conditions unrelated to `source.params` (e.g. a fixed cutoff date not present in the source query).
   - Supported operators: `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `BETWEEN`, `LIKE`. For `IN`, `value` is an array. For `BETWEEN`, `value` is a two-element array `[min, max]`.

6. **Populate `target.upsertKeys` (if `WRITE_MODE = upsert`).** List the column(s) that uniquely identify a row for the update-or-insert check. Leave as an empty array for all other write modes.

7. **Cross-check consistency.** Verify every `$ref:paramName` in `deleteCondition` has a matching `name` in `source.params` — a typo here causes a runtime reference error. Verify the `configVersion` matches the target `.exe`.

8. **Validate against the pre-check expectations.** Confirm `source.database`/`source.table` and `target.database`/`target.table` actually exist and are spelled correctly — the Pre-check Validator (see `reference/DataBridge_Project_Report.md`, Section 3) will fail fast if not, but catching it earlier saves a run cycle.

## Verification Checklist

- [ ] `configVersion` matches the target `.exe` build exactly.
- [ ] `WRITE_MODE` chosen matches the task's actual data-replacement need.
- [ ] `source.query` uses named parameters bound via `source.params` — no inlined literals.
- [ ] Every `source.params` entry has the correct `type`.
- [ ] If `deleteThenInsert`: `deleteCondition.conditions` is present, and any value shared with `source.params` uses `$ref:` instead of a duplicated literal.
- [ ] If `upsert`: `upsertKeys` is populated with the correct uniqueness columns.
- [ ] All operators used are from the supported list, with correctly shaped `value` (array for `IN`/`BETWEEN`).
- [ ] Database and table names are spelled correctly on both source and target.

## Related References

- `AGENTS.md` — Section 4.3 (No Hardcoding — Config-Driven Behavior), Section 6 (Version Consistency Rule)
- `reference/DataBridge_Project_Report.md` — Section 4.2 (config.json schema), Section 5.1 (Write Modes), Section 5.5 ($ref: mechanism)
