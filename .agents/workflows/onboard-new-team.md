# Onboard New Team

This is a one-time workflow guide for helping a new team within the organization start using DataBridge. Unlike the files in `.agents/skills/`, this is a people-facing process, not a repeatable coding task — use it as a checklist when a new team requests access to DataBridge for the first time.

## When to Use This Workflow

Trigger this workflow when:
- A new team/department requests to use DataBridge for the first time.
- Someone asks "how do I get a new team started with DataBridge?"

## Prerequisites

Before starting, confirm:

1. The current stable release package exists (built via `.agents/skills/release-build/SKILL.md`), containing the binary, example `.env`, example `config.json`, and `README.md`.
2. You know the new team's specific migration task: source database/table, target database/table, and the condition/logic involved — this is needed to help them write their first `config.json`.

## Steps

1. **Distribute the base package.** Provide the new team with the current release package as-is:
   ```
   DataBridge-vX.Y.Z/
   ├── DataBridge.exe (or DataBridge for Linux)
   ├── .env
   ├── config.json
   └── README.md
   ```
   Do not build a custom binary per team — every team uses the same compiled binary, only `.env` and `config.json` differ (per `reference/DataBridge_Project_Report.md`, Section 6.4).

2. **Confirm their operating system.** Provide the Windows `.exe` or the Linux binary depending on where the team will run it. If they need both, provide both.

3. **Walk through `.env` structure.** Explain the two functional groups of fields:
   - Connection settings (`SOURCE_DB_*`, `TARGET_DB_*`) — their own database credentials and hosts.
   - Execution behavior (`WRITE_MODE`, `BATCH_SIZE`, `MAX_RETRIES`, `RETRY_BACKOFF`, `BATCH_CONCURRENCY_LIMIT`, `PRECHECK_*`, `LOG_*`) — safe to keep at example/default values for a first run.

   Reference: `reference/DataBridge_Project_Report.md`, Section 4.1.

4. **Walk through `config.json` structure.** Explain `configVersion` (must match the binary they were given — never edit this value), `description`, and the `source`/`target` blocks. Point them to `.agents/skills/config-authoring/SKILL.md` if an AI agent is helping them author their first task-specific config, or to `reference/DataBridge_Project_Report.md`, Section 4.2 for manual reference.

5. **Flag the credential security note explicitly.** Passwords in `.env` are stored as plain text by design (see `reference/DataBridge_Project_Report.md`, Section 7). Remind the team this tool is approved for internal-network use only, and that `.env` files must never be committed to shared/public repositories or sent over insecure channels.

6. **Recommend a safe first test run.** Before running against production data, suggest the team:
   - Point `source`/`target` at a non-critical or staging table if one is available.
   - Use `WRITE_MODE=insertOnly` for the very first run if possible, since it never deletes existing data — lowest-risk mode to validate connectivity and query correctness.
   - Review the generated `logs/` output after the first run to confirm the expected number of rows were processed.

7. **Explain where to find help afterward.** Point the team to:
   - `README.md` (Thai) for day-to-day usage and field reference.
   - The central IT team for anything requiring a new binary version or a schema/configVersion change — teams must never attempt to modify the binary or bypass a `configVersion` mismatch error themselves.

8. **Record the new team as an active user** (if the organization tracks this) so they receive notice of future binary updates, especially ones that bump `configVersion` (per `.agents/skills/release-build/SKILL.md`).

## Verification Checklist

- [ ] Team received the correct binary for their OS.
- [ ] Team understands the difference between `.env` (connection/execution) and `config.json` (task logic).
- [ ] Team was warned about plain-text credentials and internal-only usage.
- [ ] Team's first run used a low-risk write mode (`insertOnly` if possible) against a non-critical table.
- [ ] Team knows to contact the central IT team for binary updates or schema changes — not to self-modify the binary.

## Related References

- `reference/DataBridge_Project_Report.md` — Section 0.5 (Target User Groups), Section 4 (Config File Structure), Section 6.4 (Build and Distribution), Section 7 (Credential security risk)
- `.agents/skills/release-build/SKILL.md` — how the package the team receives was built
- `.agents/skills/config-authoring/SKILL.md` — for authoring their first task-specific config.json
