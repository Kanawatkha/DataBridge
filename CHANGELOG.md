# CHANGELOG

All notable changes to DataBridge are documented in this file. This project tracks two related version numbers:

- **Binary version** — the `.exe` version shown by `DataBridge.exe --version`.
- **Config schema version** — the `configVersion` field expected inside `config.json`.

Any change to the `config.json` schema MUST bump the config schema version and be recorded here, per the rule in `AGENTS.md` (Section 6, Version Consistency Rule).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Planned
- Initial implementation of DataBridge based on `reference/DataBridge_Project_Report.md`.

## [1.0.0] - 2026-07-17

### Added
- Initial project definition finalized: requirements, architecture, workflow, config schema, risks, and roadmap documented in `reference/DataBridge_Project_Report.md`.
- Config schema version `1.0` defined for `config.json` (see Section 4.2 of the project report).
- Agent-facing documentation established: `AGENTS.md`, `CONTEXT.md`, `.agents/skills/`, `.agents/workflows/`.

---

## How to Add an Entry

When making a change that affects the config schema (`configVersion`), the binary version, or user-facing behavior, add a new entry above following this template:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features.

### Changed
- Changes to existing behavior. If this includes a configVersion bump, state the old and new version explicitly.

### Fixed
- Bug fixes.

### Removed
- Removed features.
```

Config-breaking changes (i.e. anything that requires users to update their `config.json`) must be called out explicitly under **Changed**, stating both the old and new `configVersion` values.
