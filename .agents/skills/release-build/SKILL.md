---
name: release-build
description: Use this skill when compiling DataBridge into distributable binaries (Windows and Linux), bumping the version number, and packaging deliverables for distribution to teams. Trigger when the user asks to "build a release", "compile the exe", or "prepare a new version for distribution".
---

# Release Build

This skill guides the process of building DataBridge into cross-platform binaries and assembling the deliverable package described in `reference/DataBridge_Project_Report.md`, Sections 4.3 and 6.4.

## When to Use This Skill

Trigger this skill when the user asks to:
- Build/compile a new `.exe` (Windows) or binary (Linux) for distribution.
- Cut a new release version.
- Prepare the deliverable package to send to teams.

## Prerequisites

Before starting, confirm:

1. All code changes intended for this release have passed `bun run typecheck` and `bun test` with zero failures.
2. You know whether this release changes the `config.json` schema. If it does, a `configVersion` bump is mandatory (see Step 3).
3. `CHANGELOG.md` has an `[Unreleased]` section describing what changed since the last release.

## Steps

1. **Determine the version bump.** Follow semantic versioning:
   - **Patch** (e.g. 1.0.0 → 1.0.1): bug fixes only, no behavior or schema change.
   - **Minor** (e.g. 1.0.0 → 1.1.0): new backward-compatible features, no `configVersion` change.
   - **Major** (e.g. 1.0.0 → 2.0.0): breaking changes to `config.json` schema or `.env` fields — requires a `configVersion` bump.

2. **Bump `configVersion` if the schema changed.** If any field was added, removed, or renamed in `config.json` (see `reference/DataBridge_Project_Report.md`, Section 4.2), update the `configVersion` value checked by the Config Loader (`src/config/`). This is mandatory per `AGENTS.md` Section 6 — never skip this step even for a seemingly minor schema tweak.

3. **Update `CHANGELOG.md`.** Move the `[Unreleased]` content into a new dated version entry. If `configVersion` changed, explicitly state the old and new value under **Changed**, per the template in `CHANGELOG.md`.

4. **Update the version string.** Update the value returned by the `--version` CLI command (see `src/cli/`) to match the new release version.

5. **Compile the Windows binary:**
   ```
   bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile DataBridge.exe
   ```

6. **Compile the Linux binary:**
   ```
   bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile DataBridge
   ```

7. **Verify both binaries run and report the correct version.** Run `DataBridge.exe --version` (Windows) and `./DataBridge --version` (Linux) and confirm the output matches the version set in Step 4.

8. **Assemble the deliverable package** per `reference/DataBridge_Project_Report.md`, Section 4.3:
   ```
   DataBridge-vX.Y.Z/
   ├── DataBridge.exe          (or DataBridge for Linux)
   ├── .env                    <- example, with placeholder credentials
   ├── config.json             <- example, matching the new configVersion
   └── README.md               <- Thai-language user manual, updated if config fields changed
   ```

9. **Update `README.md` if needed.** If any `.env` or `config.json` field was added/changed/removed, update the Thai-language README to describe it (per `reference/DataBridge_Project_Report.md`, Section 6.5).

10. **Distribute.** Hand off the packaged folder to each team per `.agents/workflows/onboard-new-team.md` guidance (for new teams) or via the existing distribution channel (for existing teams updating their binary).

## Verification Checklist

- [ ] `bun run typecheck` and `bun test` pass with zero failures before building.
- [ ] `configVersion` bumped if — and only if — the config schema changed.
- [ ] `CHANGELOG.md` updated with the new version entry, old/new `configVersion` stated if applicable.
- [ ] `--version` output matches the new release version on both binaries.
- [ ] Both Windows and Linux binaries compiled and smoke-tested.
- [ ] Deliverable package contains exactly: binary, `.env` example, `config.json` example, `README.md`.
- [ ] `README.md` reflects any config field changes.

## Related References

- `AGENTS.md` — Section 3 (Build & Test Commands), Section 6 (Version Consistency Rule)
- `reference/DataBridge_Project_Report.md` — Section 4.3 (Deliverable Package), Section 6.3 (Versioning), Section 6.4 (Build and Distribution), Section 7 (configVersion mismatch risk)
- `CHANGELOG.md` — entry template and history
