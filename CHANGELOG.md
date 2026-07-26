# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.2.0 - 2026-07-26

### Added

- Private staged-workspace validation before real project files are changed.
- Strict npm audit schema validation and fail-closed registry handling.
- No-new/no-worse vulnerability acceptance policy.
- npm-compatible semantic-version and package-spec handling.
- Stable CLI exit codes and JSON output.
- Structured unresolved-package guidance with attempted versions, stable reason codes, blocking evidence, and suggested next actions.
- Bounded direct-root peer cohorts with npm-backed full dependency resolution.
- Controlled fresh-lock fallback and bounded fixpoint re-planning.
- Configurable limits for peer closure, cohort size, candidate shortlists, resolver attempts, and passes.
- One bounded retry for transient registry failures.
- TypeScript declarations and packed-consumer declaration tests.
- ESM-only conditional exports and package-type resolution checks.
- Contract, integration, transaction, installed-tarball, runtime-matrix, and real-project validation.

### Changed

- Dry run is the default; `--apply` is required for writes.
- Apply mode now requires `--test <command>` unless dependency-only validation is explicitly acknowledged with `--allow-no-test`.
- Verification runs against the staged installed dependency tree.
- Git and non-git apply behavior is explicit.
- Candidate discovery rejects known-ineligible versions before peer analysis and stops peer traversal as soon as policy has a definitive result.
- Registry versions marked deprecated are rejected for direct upgrades, parent upgrades, discovered candidates, and override fallbacks.
- Security upgrades within an already-deprecated direct-root package line are permitted while newly deprecated candidates remain rejected.
- Registry range results are sorted semantically, candidate Node engine ranges are enforced, and compatible override candidates are validated in bounded batches.
- Local and prepack gates now include an isolated dependency audit with npm workspace traversal disabled.
- Synchronous CommonJS `require()` is rejected at the package boundary; CommonJS callers can use dynamic `import()`.
- Reports explicitly record when `--allow-no-test` accepted dependency-only validation.

### Removed

- Custom semantic-version range approximation.
- Partial target writes after verification failures.
