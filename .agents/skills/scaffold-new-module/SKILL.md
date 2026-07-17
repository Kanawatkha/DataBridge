---
name: scaffold-new-module
description: Use this skill whenever adding a new capability, feature, or file to the DataBridge codebase (outside of adding a database adapter, which has its own dedicated skill). Ensures new code is placed in the correct architectural layer, follows Separation of Concerns, and avoids hardcoding, per AGENTS.md.
---

# Scaffold New Module

This skill guides how to correctly place and structure new code when extending DataBridge, ensuring compliance with the layered architecture and coding standards defined in `AGENTS.md`, Section 4.

## When to Use This Skill

Trigger this skill when the user asks to:
- Add a new feature or capability not covered by a more specific skill (e.g. a new CLI flag, a new logging behavior, a new retry strategy option, a new pre-check type).
- Create a new file or module in the codebase.
- Refactor existing code that seems to violate layer boundaries.

Do NOT use this skill for adding a new database vendor — use `add-database-adapter` instead. Do NOT use this skill for building/releasing binaries — use `release-build` instead. Do NOT use this skill for writing `config.json` task files — use `config-authoring` instead.

## Prerequisites

Before starting, confirm:

1. You have read the folder structure in `AGENTS.md`, Section 5.
2. You understand which of the five layers (CLI, Config, Adapter, Core/Domain, Logging) the new capability belongs to.

## Steps

1. **Identify the correct layer.** Match the new capability to exactly one layer:
   - **CLI/Entry Layer** (`src/cli/`) — new command-line flags, argument parsing, program bootstrap.
   - **Config Layer** (`src/config/`) — new `.env`/`config.json` fields, validation rules, `configVersion` checks.
   - **Adapter Layer** (`src/adapters/`) — vendor-specific database behavior (use `add-database-adapter` skill instead if this is the case).
   - **Core/Domain Layer** (`src/core/`) — write-mode logic, transaction management, retry logic, batch streaming, pre-check validation logic.
   - **Logging Layer** (`src/logging/`) — logger configuration, log formatting, log rotation behavior.

   If the capability seems to span two layers, split it into two separate pieces of work — one per layer — rather than writing one file that spans both.

2. **Choose a file name and location that reflects a single responsibility.** Follow the Single Responsibility rule (`AGENTS.md` Section 4.4): one file, one reason to change. For example, a new retry strategy option belongs in `src/core/retry-handler.ts` (extending it) — not in a new file that also touches logging.

3. **Design for Dependency Injection.** If the new module depends on another layer (e.g. Core logic needing a database adapter, or a CLI command needing the Config Loader), receive that dependency via constructor or function parameters. Never import and instantiate a concrete implementation directly inside business logic (`AGENTS.md` Section 4.2).

4. **Externalize configurable values.** Any new behavior that could reasonably vary between runs or environments (thresholds, toggles, modes, limits) must be added as a new `.env` or `config.json` field — never hardcoded as a constant in source code (`AGENTS.md` Section 4.3). If this requires a new `config.json` field, also follow the `config-authoring` skill's schema conventions and flag that `configVersion` must be bumped (see `release-build` skill).

5. **Use structured logging, not `console.log`.** Any new code that needs to report status or errors must go through the shared structured logger (`AGENTS.md` Section 4.5).

6. **Route errors through the centralized error handler.** New failure paths must integrate with the existing centralized error-handling mechanism rather than introducing ad-hoc try/catch blocks with inconsistent behavior (`AGENTS.md` Section 4.6).

7. **Add tests alongside the new module**, following existing test file conventions, covering both the isolated unit behavior and its integration point with adjacent layers (via injected mocks, not real dependencies).

8. **Run verification.** Execute `bun run typecheck` and `bun test` before considering the module complete.

## Verification Checklist

- [ ] New code lives entirely within one architectural layer; no cross-layer logic mixed into a single file.
- [ ] File name and scope reflect a single responsibility.
- [ ] Dependencies are injected, not directly instantiated.
- [ ] No hardcoded values — new configurable behavior is exposed via `.env` or `config.json`.
- [ ] If a new `config.json` field was added, `config-authoring` conventions were followed and a `configVersion` bump is flagged for the next release.
- [ ] Logging goes through the structured logger, not raw `console.log`.
- [ ] Errors flow through the centralized error-handling mechanism.
- [ ] `bun run typecheck` and `bun test` pass with zero failures.

## Related References

- `AGENTS.md` — Section 4 (Architecture & Coding Standards, full), Section 5 (Folder Structure)
- `reference/DataBridge_Project_Report.md` — Section 2.2 (High-Level Components)
- `.agents/skills/add-database-adapter/SKILL.md` — for new database vendors specifically
- `.agents/skills/config-authoring/SKILL.md` — for new config.json fields specifically
- `.agents/skills/release-build/SKILL.md` — for configVersion bump procedure
