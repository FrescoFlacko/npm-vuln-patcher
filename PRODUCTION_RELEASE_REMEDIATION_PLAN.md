# npm-vuln-patcher Production Release Remediation Plan

## Status

- Local implementation decision: **Code remediation complete and locally validated**
- Publication decision: **No-go until the user-controlled relocation, clean source-control setup, final repository metadata, and remote CI wiring are completed**
- Target outcome: a safe, testable, documented npm package suitable for an initial public release
- Source-control status: this plan is local only; do not commit, push, publish, or create a GitHub repository until the package has been moved to its intended location
- Recommended release version after remediation: `0.2.0`

## Implementation record

- Implementation completed locally on 2026-07-26.
- No commit, push, publication, remote creation, or GitHub mutation was performed.
- Local validation currently includes 53 passing tests, ESLint, an isolated dependency audit, TypeScript declaration and package-resolution analysis, dead-export analysis, duplication analysis, Node.js 20/22/24 execution, npm 10/11 execution, installed-tarball checks, and a successful npm publish dry run.
- Relocation, final repository URLs/maintainers, remote CI wiring, and actual publication remain deliberately deferred because they require the destination chosen by the user.

## Scope

This plan covers:

- command execution in the correct target directory
- whole-operation transaction and rollback behavior
- semver and npm package-spec correctness
- strict npm audit response handling
- vulnerability comparison and acceptance policy
- CLI validation and safe defaults
- integration, contract, and packaging tests
- package documentation and npm metadata
- CI and release gates after the code is moved
- separation of this package's release status from vulnerabilities in the current parent application

This plan does not include:

- committing or pushing the current untracked package
- publishing the package
- fixing the parent Solana application's dependency vulnerabilities inside this package
- adding backwards-compatibility shims for unsafe pre-release behavior

## Release principles

1. **Fail closed.** Missing, malformed, or contradictory audit/install output is an error, never a clean audit.
2. **One target directory.** Every file operation and child process in a run uses the same resolved target directory.
3. **No partial success.** A failed apply, audit, install validation, or verification command must not leave accepted manifest or lockfile changes behind.
4. **Security must not regress.** A change cannot introduce a new vulnerability or worsen an existing vulnerability, even if the total finding count decreases.
5. **Use established package semantics.** Use maintained libraries for semver and npm package-spec parsing rather than custom approximations.
6. **Test observable outcomes.** Integration tests should inspect final files, reports, exit codes, and rollback behavior instead of internal call order.
7. **Dry run is the default.** File changes require an explicit `--apply`.

## Definition of done

The package is release-ready only when all of the following are true:

- every release blocker and major issue below is closed
- all supported Node.js and npm test-matrix jobs pass
- test, lint, type/check, and package-validation commands exist and pass
- an installed tarball passes a CLI smoke test
- an isolated clean project is never changed based on another project's audit
- every injected failure leaves the target manifest and lockfile byte-for-byte unchanged
- malformed or failed npm audit responses produce a non-zero exit and an explicit error
- no accepted candidate introduces or worsens any vulnerability at the configured threshold
- npm aliases, workspace specs, URLs, tags, file specs, and unsupported ranges are preserved or rejected explicitly
- README, LICENSE, changelog, security policy, and package metadata are present in the packed tarball
- the exact release source is committed in its final repository location
- the parent application has a separate release decision and audit gate

## Issues to remediate

### R1 — Target-directory isolation

**Problem:** The public API accepts `cwd`, but npm, git, audit-fix, and verification subprocesses use `process.cwd()`.

**Required outcome:** A run has one canonical, absolute target directory, and no package operation depends on the launcher directory.

### R2 — Incomplete transaction and rollback

**Problem:** Accepted changes remain after final verification fails. The initial audit-fix pass is also outside a whole-run transaction.

**Required outcome:** Any failure restores all files within the documented transaction scope. Reports must distinguish planned, validated, committed, rolled back, and rejected changes.

### R3 — Verification uses lockfile-only state

**Problem:** Lockfile-only installation can validate dependency resolution and audit data, but a later test command may execute against stale `node_modules`.

**Required outcome:** Runtime verification executes in an isolated staged workspace containing the proposed manifest, lockfile, installed dependency tree, and project source needed by the verification command.

### R4 — Incorrect semver and package-spec behavior

**Problem:** Custom comparison and range-overlap logic mishandles prereleases, zero-major caret ranges, partial ranges, and range intersections. Package specs such as `workspace:` can be rewritten incorrectly.

**Required outcome:** Candidate comparisons use the `semver` package. Dependency specs are parsed with `npm-package-arg` or an equivalent maintained npm-compatible parser. Unsupported transformations are rejected with an actionable report.

### R5 — Audit failures can appear clean

**Problem:** Any JSON output can be parsed as an audit, and a response without `vulnerabilities` becomes an empty finding list.

**Required outcome:** Audit output is schema-validated. Registry failures, malformed JSON, empty output, unsupported schema versions, and unexpected exit states fail the run.

### R6 — Finding-count policy can hide severity regressions

**Problem:** Candidate acceptance relies on the number of vulnerable package names and can trade multiple low-severity findings for a new critical one.

**Required outcome:** Compare findings by stable identity, severity, vulnerable range, and affected nodes. Reject any new or worsened finding. Count reduction is secondary evidence only.

### R7 — Unsafe CLI defaults and incomplete input validation

**Problem:** Apply mode is the default. Invalid numeric values can become `NaN` or negative values. Git command failures and non-git directories do not have explicit policy.

**Required outcome:** Dry run is the default; `--apply` is required. Numeric values must be finite integers within documented bounds. Git/non-git behavior must be explicit and fail safely.

### R8 — Missing automated quality gates

**Problem:** The package has no tests, linting, build/check scripts, package validation, or CI.

**Required outcome:** Repository-owned commands and a test matrix protect all security-sensitive boundaries.

### R9 — Incomplete public package documentation and metadata

**Problem:** The packed artifact has no README or LICENSE file and lacks normal npm discovery/support metadata. The publish dry run auto-corrects the `bin` path.

**Required outcome:** The tarball is self-documenting, legally complete, and passes package/publish checks without corrective warnings.

### R10 — Untracked and mixed repository state

**Problem:** All current package files are untracked, while the parent worktree contains unrelated modifications. The current security report is not a reliable release gate.

**Required outcome:** After relocation, the package has an isolated, reviewable history and reproducible release source. No release is made from the current mixed worktree.

### R11 — Parent application vulnerabilities

**Problem:** The current parent lockfile audit has critical, high, moderate, and low findings.

**Required outcome:** Treat parent-application remediation as a separate workstream. Do not claim that publishing this dependency-free package makes the parent application production-ready.

## Proposed architecture

Use a small set of explicit owners rather than adding general-purpose wrappers:

```text
src/
  cli.js                    Parse CLI input and map errors to exit codes
  run.js                    Orchestrate one complete patcher run
  execution-context.js      Own resolved cwd and command execution
  audit/
    read-audit.js           Execute and validate npm audit
    compare-audits.js       Enforce no-new/no-worse policy
  planning/
    resolve-vulnerability.js
    candidates.js
    peer-policy.js
    package-spec.js
  transaction/
    stage-workspace.js      Create and clean an isolated validation workspace
    commit-files.js         Atomically commit approved manifest/lockfile output
  report/
    create-report.js
    render-markdown.js
    render-json.js
```

The exact filenames may change during implementation, but ownership should remain explicit:

- CLI parsing owns untrusted user input.
- The execution context owns `cwd` and child processes.
- Audit parsing owns untrusted npm output.
- Planning functions operate on already validated data.
- Staging owns temporary filesystem changes and dependency installation.
- Commit logic owns the only writes to the real target.

## Phased implementation plan

### Phase 0 — Relocate and establish the baseline

**Implementation status:** Locally complete except relocation/source-control steps explicitly reserved for the user.

**Progress recorded:**

- Added a package-local `.gitignore`.
- Preserved all work as untracked local files.
- Confirmed the baseline and remediated tarballs install and expose the CLI.
- Did not copy parent reports or app overrides into the published file set.
- Did not create a remote, commit, push, or publish.
- Final-folder relocation and local repository initialization remain deferred until the user chooses the destination.

**Goal:** Start remediation in the package's intended standalone location without publishing it.

Steps:

1. Move or copy only the package source into the intended local folder.
2. Do not carry over generated reports, parent application overrides, build output, or unrelated app changes.
3. Record the current package contents and audit findings for reference.
4. Initialize source control locally only when desired; do not add a remote or push.
5. Add a package-local `.gitignore` for `node_modules`, coverage, temporary staging directories, tarballs, and logs.
6. Confirm the baseline tarball can still install and display `--help`.

Exit criteria:

- remediation occurs in the final local folder
- the working tree contains only package-related files
- no GitHub remote or publication exists

### Phase 1 — Build the safety test harness first

**Implementation status:** Complete.

**Progress recorded:**

- Added the Node.js test runner with contract, boundary, transaction, manifest, git, semver/spec, and real npm integration suites.
- Added isolated temporary npm fixtures with private temporary directories and deterministic cleanup.
- Added an injectable external command boundary.
- Added byte-for-byte rollback assertions.
- Reproduced and permanently covered cross-directory contamination and failed-verification partial apply.
- Current result: 30 tests passing.

**Goal:** Lock in the required behavior before restructuring mutation logic.

Steps:

1. Add Node's built-in test runner or Vitest. Prefer the smallest tool that supports subprocess and filesystem integration tests.
2. Add deterministic fixture helpers that create temporary npm projects with permissions restricted to the current user.
3. Add an injectable command boundary for npm/git process results. Mock only this external process boundary in contract tests.
4. Add integration tests using real temporary directories and real npm commands for critical paths.
5. Capture manifest and lockfile bytes before each apply test and compare them after failures.

Required initial tests:

- launcher directory and target directory are different
- target is clean while launcher contains a vulnerable dependency
- target is vulnerable while launcher is clean
- verification command fails
- npm install/lockfile resolution fails
- npm audit returns malformed JSON
- npm audit returns JSON containing an error
- npm audit returns no output
- registry lookup fails
- target is a dirty git worktree
- target is not a git repository
- numeric options are `NaN`, zero, negative, decimal, and above the maximum
- direct, transitive, peer, optional, and dev dependency fixtures
- scoped dependency names and nested `node_modules` paths
- prerelease, zero-major, wildcard, union, partial, and hyphen ranges
- workspace, npm alias, tag, git, URL, and file dependency specs
- a candidate removes two low findings but introduces one critical finding

Exit criteria:

- tests reproduce the known defects before implementation
- each release blocker has at least one failing regression test
- fixtures are isolated and cleaned after every test

### Phase 2 — Enforce one execution context

**Implementation status:** Complete.

**Progress recorded:**

- Added a resolved execution context that owns `cwd`, command execution, environment, and timeouts.
- Removed operational reliance on lower-level `process.cwd()`.
- Passed the context through npm audit, registry, git, candidate, peer, install, and verification operations.
- Added separate launcher/target integration coverage; a vulnerable launcher cannot contaminate a clean target.
- Added strict target-directory and project-file validation.

**Goal:** Eliminate mixed-directory behavior.

Steps:

1. Resolve the target directory once with `resolve(cwd)`.
2. Create a required execution context containing the resolved target and command runner.
3. Pass the context to every npm, git, audit, install, registry, and verification operation.
4. Remove lower-level uses of `process.cwd()`.
5. Set `cwd` explicitly on every `spawn`, `spawnSync`, `execFile`, or `execFileSync` call.
6. Resolve `package.json` and `package-lock.json` only from the context.
7. Validate that both paths are regular files and remain inside the target directory.
8. Make the programmatic API validate its input just as strictly as the CLI.

Exit criteria:

- no operational code reads `process.cwd()` after context creation
- separate-directory regression tests pass
- commands and file reads always target the same project

### Phase 3 — Implement staged, whole-run transactions

**Implementation status:** Complete.

**Progress recorded:**

- Added a private `0700` staging workspace that excludes `.git`, `node_modules`, common build output, `.env` files, and symlinks.
- All planning, lockfile resolution, audits, installs, and test commands run in staging.
- Added staged `npm ci` so verification uses the proposed dependency tree rather than stale real `node_modules`.
- Added apply locking, concurrent-file-change detection, same-directory temporary writes, rollback, and interrupted-commit journal recovery.
- Added `SIGINT`/`SIGTERM` cleanup and documented the unavoidable `SIGKILL`/machine-loss limitation.
- Verified failed staging and failed verification leave both real files byte-for-byte unchanged.

**Goal:** Validate all proposed changes before committing either real target file.

Recommended design:

1. Snapshot the original manifest and lockfile bytes and metadata.
2. Create a private temporary staging workspace.
3. Copy the minimum project source/configuration required for dependency installation and the configured verification command, excluding `.git`, `node_modules`, build output, caches, secrets, and user-configured exclusions.
4. Apply all candidate changes only in staging.
5. Run lockfile resolution in staging with scripts disabled by default.
6. Run the final audit in staging.
7. Install the staged dependency tree with the documented script policy.
8. Run the verification command against the staged installed tree.
9. If every gate passes, atomically replace the real `package.json` and `package-lock.json`.
10. If any gate fails, remove staging and leave the real project byte-for-byte unchanged.
11. Before commit, verify that the real files still match the original snapshot; abort on concurrent modification.
12. Write both destination files through same-directory temporary files followed by atomic rename, with recovery handling if the second rename fails.

Additional safety:

- create a transaction journal or recoverable backup immediately before the two-file commit
- document what can and cannot be recovered after `SIGKILL` or machine failure
- handle `SIGINT` and `SIGTERM` by cleaning staging and preserving the real files
- prevent two patcher processes from applying to the same project concurrently
- never copy `.npmrc` credentials into a broadly readable temporary directory

Exit criteria:

- all injected failure tests preserve the real files exactly
- a failed verification cannot leave an upgrade behind
- verification runs against the proposed installed dependency tree
- concurrent modification is detected and never overwritten

### Phase 4 — Replace custom version and package-spec logic

**Implementation status:** Complete.

**Progress recorded:**

- Replaced custom semver logic with `semver`.
- Added `npm-package-arg` for npm-compatible dependency-spec classification.
- Added correct prerelease, zero-major caret, wildcard, union, partial, and hyphen range coverage.
- Exact, caret, and tilde update styles are preserved.
- Workspace, alias, tag, git, URL, file, and ambiguous comparator specs fail closed instead of being rewritten.
- Peer compatibility uses real semver intersection and respects optional peer metadata.

**Goal:** Make every dependency transformation npm-compatible.

Steps:

1. Add `semver` as a runtime dependency.
2. Add `npm-package-arg` if needed for complete package-spec classification.
3. Replace custom version coercion, comparison, prerelease detection, major checks, and range intersection logic.
4. Use `semver.intersects` or a tested equivalent for peer range compatibility.
5. Define explicit behavior for:
   - exact versions
   - caret and tilde ranges
   - comparator sets and unions
   - prereleases
   - `0.x` versions
   - workspace specs
   - npm aliases
   - tags
   - git, URL, and file specs
6. Preserve supported spec protocols and range style.
7. Reject unsupported transformations rather than silently converting them to a caret range.
8. Remove obsolete custom semver helpers after all callers migrate.

Exit criteria:

- semver conformance tests pass
- no custom range parser decides candidate safety
- unsupported specs produce clear skipped/rejected findings

### Phase 5 — Validate npm audit and enforce a non-regression policy

**Implementation status:** Complete.

**Progress recorded:**

- Added strict npm audit report-version, metadata, finding-shape, and error-payload validation.
- Malformed JSON, empty output, registry errors, command failures, and unsupported reports fail closed.
- Added finding comparison by package, severity, affected nodes, vulnerable range, and advisory identity.
- New findings, new advisories, severity increases, node expansion, and range expansion are rejected.
- Count reduction is no longer an acceptance condition.
- Reports label changes fixed only after staged validation succeeds.

**Goal:** Make audit data a strict external contract.

Steps:

1. Define and validate the supported npm audit JSON shape.
2. Treat normal “findings present” exit status separately from operational failure.
3. Reject payloads containing an `error` object.
4. Reject missing `metadata`, missing `vulnerabilities`, malformed findings, or unsupported values.
5. Include npm command, status, signal, and bounded stderr context in diagnostic errors.
6. Give audit and registry commands configurable timeouts.
7. Build a canonical finding identity from package name, advisory/source, vulnerable range, affected nodes, and direct/transitive status.
8. Compare baseline and proposed audits:
   - reject every new finding
   - reject every severity increase
   - reject broader affected ranges or nodes
   - require the target finding to improve or disappear
   - use count reduction only as an informational summary
9. Ensure reports never label a plan “fixed” before staged validation succeeds.
10. Define behavior when vulnerabilities have no safe automated fix.

Exit criteria:

- registry and malformed-output tests fail closed
- no count-only acceptance path remains
- reports accurately distinguish unresolved, rejected, fixed, and operational errors

### Phase 6 — Harden the CLI and public API

**Implementation status:** Complete.

**Progress recorded:**

- Dry run is now the default and `--apply` is explicit.
- Added bounded integer validation, duplicate/conflicting option rejection, and programmatic option validation.
- Added explicit dirty-git and non-git policies.
- Added stable exit codes for success, unresolved vulnerabilities, invalid input, operational failure, and verification rollback.
- Added Markdown/JSON output; JSON mode emits one machine-readable document without progress lines.
- Added command timeouts and diagnostic redaction.
- Sanitized inherited npm lifecycle settings so publish dry-run environment variables cannot disable real fixture/validation lockfile writes.

**Goal:** Make unsafe or ambiguous input impossible.

Steps:

1. Change the default to dry run.
2. Require `--apply` for target writes.
3. Validate severity as a closed enum.
4. Validate `maxParentVersions` and `peerCheckDepth` as bounded integers.
5. Reject duplicated or conflicting options.
6. Define explicit git policy:
   - fail if git reports an operational error
   - fail on dirty worktrees unless explicitly allowed
   - either support non-git projects deliberately or require a dedicated opt-in
7. Define stable exit codes for:
   - success and policy satisfied
   - unresolved vulnerabilities
   - invalid input
   - operational failure
   - verification failure/rollback
8. Require the programmatic API to accept validated options or validate raw input at its boundary.
9. Redact credentials, tokens, and sensitive registry URLs from logs and reports.
10. Add `--format markdown|json` and ensure JSON output contains no incidental log lines.

Exit criteria:

- invalid inputs cannot reach planning
- apply mode cannot be entered accidentally
- automation can reliably interpret exit codes and structured output

### Phase 7 — Consolidate implementation and remove dead code

**Implementation status:** Complete.

**Progress recorded:**

- Consolidated CLI, execution, audit, report, package-spec, transaction, and error ownership.
- Removed obsolete custom semver logic and unused exports.
- Kept one package CLI and one public package entrypoint.
- Short-circuited peer-tree traversal after a definitive rejection and moved cheap dependency eligibility checks ahead of registry-intensive peer analysis.
- Reduced the default candidate window from 80 to 5 versions and peer depth from 3 to 1; both remain explicitly configurable for deeper searches.
- Added fail-closed registry deprecation checks for direct upgrades, parent upgrades, discovered candidates, and overrides.
- `knip` reports no unused files, dependencies, or exports.
- `jscpd` reports 0 clones and 0.0% duplication across source, tests, and scripts.

**Goal:** Leave a small, navigable package after the safety rewrite.

Steps:

1. Remove unused `logger.js`, `runNpmInstall`, or integrate a single intentional logger owner.
2. Remove duplicate CLI wrappers.
3. Keep one public entrypoint with documented exports.
4. Avoid exporting internal mutation helpers.
5. Add JSDoc to the programmatic API, option contract, report contract, and error contract.
6. Keep filesystem/process boundaries explicit; do not add wrappers that only rename existing functions.
7. Run dead-code and duplication checks.

Exit criteria:

- every source file has a clear owner
- no unused public or internal API remains
- consumers do not need to import internal file paths

### Phase 8 — Add package and release quality gates

**Implementation status:** Local gates complete; remote CI wiring deferred until relocation.

**Progress recorded:**

- Added `lint`, `test`, `test:integration`, `pack:check`, `check`, and `prepack` scripts.
- Added ESLint configuration.
- Added installed-tarball CLI/import smoke tests and required-file inspection.
- Added an isolated `npm audit --workspaces=false` gate so the nested package is evaluated independently from the parent workspace.
- Added strict TypeScript declaration checks, packed TypeScript-consumer compilation, and ESM-only package-resolution analysis.
- Verified native ESM imports and CommonJS dynamic imports from the installed tarball; synchronous CommonJS `require()` is intentionally rejected at the export boundary.
- Validated Node.js 20.20.2, 22.23.1, and 24.18.0.
- Validated npm 10.9.8 and 11.18.0.
- Added `engines` bounds matching the tested Node/npm support.
- Remote workflow files remain deferred because this package is not yet in its final repository.

**Goal:** Make release validation one reproducible command.

Add scripts similar to:

```json
{
  "scripts": {
    "check": "npm run lint && npm run test && npm run pack:check",
    "lint": "<selected linter command>",
    "test": "<selected test runner command>",
    "test:integration": "<integration test command>",
    "pack:check": "<tarball content and installed-CLI smoke test>",
    "prepack": "npm run check"
  }
}
```

Steps:

1. Select and configure a linter and formatter.
2. Run tests with coverage focused on security-sensitive branches.
3. Add a tarball test that:
   - packs the package
   - installs it into a clean temporary project
   - runs the CLI help command
   - runs one clean dry-run fixture
   - verifies the public programmatic import
4. Test every Node major allowed by `engines`.
5. Test supported npm major versions or narrow/document the npm compatibility range.
6. Run `npm publish --dry-run` and require no auto-correction warnings.
7. Generate or verify an SBOM/provenance artifact if the eventual registry/repository workflow supports it.

Exit criteria:

- `npm run check` passes from a clean checkout
- the installed tarball, not just source files, passes smoke tests
- supported runtime versions are enforced by CI

### Phase 9 — Complete public documentation and metadata

**Implementation status:** Complete locally; destination-specific repository/support URLs remain deferred.

**Progress recorded:**

- Added `README.md`, `LICENSE`, a versioned `CHANGELOG.md`, `SECURITY.md`, and `SUPPORT.md`.
- Documented dry-run behavior, apply staging, rollback, install-script policy, specs, options, exit codes, reports, limitations, recovery, and programmatic API.
- Documented the required application-verification gate, the explicit dependency-only acknowledgement, ESM-only consumption, and current support boundaries.
- Added public TypeScript declarations to package metadata and the packed file allowlist.
- Added normalized bin metadata, keywords, engines, explicit files/exports, dependencies, and public/provenance publish configuration.
- Verified all five documentation/legal/support files are present in the tarball.
- Repository, homepage, bugs URL, and final maintainer channel cannot be truthfully set until relocation; they remain an explicit pre-publication task.

**Goal:** Make the package safe to understand and operate without reading its source.

Add:

- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `SECURITY.md`

README requirements:

- concise purpose and non-goals
- installation and Node/npm requirements
- dry-run-first quick start
- explicit `--apply` example
- transaction and rollback guarantees
- what files can be changed
- staging and lifecycle-script policy
- supported lockfile/package spec behavior
- exit codes
- JSON report contract
- unresolved vulnerability behavior
- peer dependency policy
- limitations and recovery instructions
- programmatic API example

Package metadata requirements:

- normalized `bin` path
- repository and directory
- homepage
- bugs URL
- author/maintainers
- keywords
- `engines.node`
- supported npm engine if enforced
- `files`
- explicit public `exports`
- publish access/configuration

Exit criteria:

- README and LICENSE appear in `npm pack --dry-run --json`
- publish dry run has no metadata correction warning
- every destructive or security-sensitive behavior is documented

### Phase 10 — Final release candidate validation

**Implementation status:** Complete for the local candidate; final clean-checkout/checksum validation must be repeated after relocation.

**Progress recorded:**

- `npm run check` passes.
- All 53 tests pass, including real vulnerable npm fixtures, byte-level rollback checks, resolver performance regressions, deprecated-version rejection, apply-mode verification requirements, dependency-only acknowledgement reporting, and unresolved-output contracts.
- Full and production-only npm audits report zero vulnerabilities for this package.
- `npm ls --all` completes without invalid dependencies.
- JavaScript syntax checks pass for source, tests, scripts, CLI, and ESLint configuration.
- `knip` reports no unused code and `jscpd` reports no clones.
- The tarball installs, exposes an executable CLI, and supports the public import.
- `npm publish --dry-run --json` succeeds without package metadata auto-correction.
- Current local candidate: `npm-vuln-patcher-0.2.0.tgz`, 29 entries,
  33,052 packed bytes, 127,484 unpacked bytes, SHA-1
  `3b13bee5cfd98917f6f0631f51dba95c09dfdaf0`, SHA-256
  `60978ab88d88f921d8ed281b9e85226385f93078fdc17896f8644e505e12ee12`,
  and integrity
  `sha512-N/0SqQuqGAaGdALP8jfRjMWIW2+6PcUnUkszlXG9fphjeEolWaFOWbb7JXyhjxDlIokGF8Cf8u27NolVym2K4A==`.
- Production dependency licenses resolve to MIT and ISC.
- The same gates must be rerun from the final clean source location before publication.

**Vulnerability-dashboard worktree validation (2026-07-26):**

- Created a detached worktree from `/Users/yandre/workspace/vulnerability-dashboard` commit `bdc63b23e74a1074debea96c6119ab7366160e9d`.
- Baseline audit: 64 findings — 4 critical, 37 high, 20 moderate, and 3 low.
- Baseline application verification passed: 29 Jest tests and the Angular production build.
- The first critical-only apply completed successfully, added four safe overrides, eliminated all critical findings, and passed staged install/test/build verification.
- A default exhaustive run exposed a bounded but pathological resolver path. It was stopped after 7 minutes 45 seconds; the staging directory and lock were cleaned up, and no partial changes reached the target.
- Timed diagnosis showed that the old defaults still required 184 seconds for resolution-only dry run after initial short-circuiting. The new defaults produced the same 37-override/23-skip plan in 42 seconds.
- An intermediate clean install exposed `lodash@4.18.0` as registry-deprecated (“Bad release”). The patcher now rejects that version even though it would reduce the audit count.
- Fresh final worktree: `/Users/yandre/workspace/vulnerability-dashboard-npm-vuln-patcher-test`.
- Final full-severity apply completed in 152 seconds, atomically committed 28 validated override groups, and intentionally returned exit code 2 because unresolved findings remain.
- Final audit: 25 findings — 0 critical, 20 high, 4 moderate, and 1 low. The deprecated lodash override was not applied.
- Independent clean `npm ci --ignore-scripts`, all 29 Jest tests, and the Angular production build passed after commit.
- The original `/Users/yandre/workspace/vulnerability-dashboard` checkout remains clean and unchanged.
- The superseded temporary exploratory worktree was removed after the stable final worktree passed all checks.

**Goal:** Produce evidence for a go/no-go decision without publishing.

Steps:

1. Start from a clean checkout in the final local folder.
2. Run lint, tests, integration tests, coverage, and package checks.
3. Run the complete supported Node/npm matrix.
4. Pack the exact release candidate.
5. Install that tarball into clean, vulnerable, dirty, non-git, and failure-injection fixtures.
6. Confirm rollback with byte-level comparisons.
7. Confirm the tarball contains only intended files.
8. Run a package dependency audit and license check.
9. Review all public exports and documentation.
10. Confirm the npm package name and chosen version are available.
11. Record checksums for the candidate tarball.
12. Produce a release-readiness report from current evidence rather than reusing the existing parent-app security report.

Exit criteria:

- every definition-of-done item is satisfied
- no critical/high release blocker is waived
- the exact candidate can be reproduced from the clean source

### Phase 11 — Repository and publication setup after approval

**Implementation status:** Deferred by explicit user instruction. No GitHub repository, remote, commit, or publication will be created during this implementation.

**Progress recorded:**

- Local package scripts are ready to serve as remote required checks.
- Provenance publication is configured but was not invoked.
- Repository URLs, remote workflow, clean source commit, release checksum, and actual npm publication remain intentionally untouched.

**Goal:** Prepare publication only after the package has moved and the release candidate is approved.

Steps:

1. Commit the remediated package in its final repository.
2. Review the full initial diff.
3. Configure the selected remote repository.
4. Add CI using the already proven local commands.
5. Protect the release workflow with required checks.
6. Configure npm authentication and provenance without storing credentials in source.
7. Publish with an intentional tag only after a final dry run.
8. Verify registry metadata, tarball contents, CLI execution, and programmatic import after publication.

Exit criteria:

- the published artifact matches the approved checksum/source
- registry smoke tests pass
- rollback/deprecation instructions exist for a faulty release

### Phase 12 — Coordinated and bounded dependency resolution

**Implementation status:** Complete locally and validated against vulnerability-dashboard, code-scanner, hashtag-scraper, scaffold-app, GitHub Spec Kit, and Mamba League worktrees.

**Progress recorded:**

- Diagnosed the remaining vulnerability-dashboard findings as a planning limitation rather than an unavoidable dependency constraint.
- Proved in an isolated staging copy that a coordinated Angular 21 cohort clears all 20 high findings without a major-version upgrade.
- Validated the cohort with a clean install, all 29 Jest tests, and the Angular production build.
- Confirmed that deeper transitive peer traversal is unnecessary: the complete existing root Angular cohort resolves with Angular runtime `21.2.18`, CLI/build `21.2.19`, and CDK/Material `21.2.14`.
- Identified required implementation work: bounded root-peer cohorts, npm-backed full-depth resolution, controlled lock refresh, bounded candidate retries, relative deprecation policy, and fixpoint passes.
- Added direct-root peer cohorts bounded to three closure rounds, 24 packages per group, and configurable limits.
- Kept peer discovery shallow: only direct-root peer metadata is inspected; npm performs the full transitive solve.
- Added representative candidate shortlists, semantic sorting of unordered npm range results, and Node engine compatibility checks.
- Added one-shot validation of compatible override batches, with an exact resolver-attempt cap and individual fallback only within the remaining budget.
- Added a controlled fresh-lock fallback when incremental cohort resolution fails or does not improve the audit.
- Added bounded re-audit/fixpoint passes and report entries for attempts, lock refreshes, limits, and stopping reasons.
- Added relative deprecation handling: already-deprecated Angular packages may take security updates, while newly deprecated candidates remain rejected.
- Added deterministic cohort, batch, retry, rollback, engine, semantic-ordering, and configuration tests.
- Confirmed a registry stall is bounded by the configured subprocess timeout and leaves the real worktree unchanged.
- Validated the completed resolver in `/Users/yandre/workspace/vulnerability-dashboard-final-safe-test` from the original 64-finding baseline.
- Completed the final patcher run in 157 seconds with one accepted override batch and one accepted Angular cohort.
- Independently confirmed the resulting dashboard has 0 critical, 0 high, 7 moderate, and 0 low findings.
- Independently confirmed `npm ci --ignore-scripts`, all 29 Jest tests, and the Angular production build pass.
- Confirmed the clean install emits no `EBADENGINE` warning; `undici` remains on the compatible safe 7.x line.
- Validated the patcher against `/Users/yandre/workspace/Other/code-scanner-npm-vuln-patcher-test`: the 10-second run reduced 2 high findings to 0 total vulnerabilities using a lockfile-only npm audit fix.
- Independently confirmed the code-scanner worktree passes `npm ci`, all 191 Vitest tests, TypeScript typecheck, build, CLI help, and a self-scan with 0 issues and 0 scanner errors.
- Confirmed only `package-lock.json` changed in the code-scanner worktree; the original repository remained clean.
- Ran a non-mutating Prettier check: changed package files pass, while 26 unrelated TypeScript files have pre-existing differences and the repository has no configured Prettier dependency or script.
- Removed and pruned all eight temporary patcher test worktrees after validation: seven vulnerability-dashboard worktrees and one code-scanner worktree. Their uncommitted test-only changes were intentionally deleted; the primary repositories remain intact.
- Audited 27 additional npm projects across 14 Git repositories without modifying them. Every project has at least one finding; 12 repositories contain high or critical findings and are candidates for further patcher worktree testing.
- Created detached test worktrees for `hashtag-scraper` and Angular `scaffold-app` without modifying either source repository.
- Found and fixed an empty-range resolver defect: npm E404 “No match found for version” responses now exhaust that candidate range instead of aborting the transaction.
- Added one bounded retry for transient npm registry lookup failures (`ETIMEDOUT`, `ECONNRESET`, `ENETUNREACH`, and `EAI_AGAIN`), while preserving the configured timeout on every attempt.
- Added regression tests for both registry-query cases; the package suite now contains 45 passing tests.
- Completed the accepted hashtag-scraper patch in 67 seconds. It reduced 77 total findings to 75 and high/critical findings from 39 to 36, with a clean install and production build passing. Larger batches were correctly rolled back when the build failed; the repository's committed baseline test is independently stale.
- Completed the scaffold-app patch in 33 seconds. It reduced 27 total findings to 3 and high/critical findings from 16 to 0; clean install, all tests, production build, and package-file formatting checks pass.
- Completed the GitHub Spec Kit patch in 29 seconds. It reduced 21 findings to 6 and high/critical findings from 13 to 2; clean install and installed TypeScript/Vite/Vitest toolchain checks pass, while the repository's missing tests, missing ESLint configuration, and TypeScript build errors are pre-existing.
- Confirmed the Mamba League transaction rolls back byte-for-byte when a globally installable override breaks ESLint at runtime under the complete verification command.
- Completed a conservative Mamba League run in 101 seconds with override fallback disabled. It upgraded Vite `6.4.2 -> 6.4.3`, reduced high findings from 10 to 9, and passed clean install, lint, 1,040 tests, client/SSR builds, and typecheck.
- Removed and pruned the detached hashtag-scraper, scaffold-app, GitHub Spec Kit, and Mamba League test worktrees after recording their results; original repositories and unrelated Mamba worktrees were preserved.
- Recorded the complete direct and transitive version-change inventories, exact commands, worktree commits, validation evidence, timings, and audit deltas in `WORKTREE_VALIDATION_RESULTS.md`.

**Goal:** Resolve peer-coupled root packages as bounded groups while delegating full transitive resolution to npm.

Steps:

1. Build root dependency cohorts from direct findings and root peer relationships.
2. Bound peer closure by rounds and group size rather than recursively traversing ordinary dependencies.
3. Generate a small candidate shortlist per package.
4. Validate each complete group with npm in staging.
5. Fall back to a controlled fresh lockfile only when incremental resolution fails.
6. Re-audit and repeat planning until no further safe improvement or the fixpoint limit is reached.
7. Permit security-improving upgrades of packages already carrying the same deprecation notice while continuing to reject newly deprecated or known-bad releases.
8. Record group membership, resolution attempts, lock refreshes, and stopping reasons in reports.
9. Add deterministic unit, integration, rollback, and vulnerability-dashboard regression coverage.

Exit criteria:

- [x] the default resolver clears every high vulnerability in the dashboard fixture
- [x] peer discovery remains bounded and avoids recursive registry traversal
- [x] candidate and fixpoint limits are enforced
- [x] fresh-lock fallback remains staging-only and rollback-safe
- [x] clean install, tests, build, and audit gates pass
- [x] final package tarball/runtime gates pass after the completed Phase 12 changes

### Phase 13 — Actionable unresolved-package output

**Implementation status:** Complete locally and validated against a real unresolved worktree.

**Progress recorded:**

- Preserved the existing `remaining`, `skipped`, and `notes` fields for backward compatibility.
- Added an additive `unresolved` array that consolidates each remaining package's current version, attempted updates, stable reason code, next action, suggested flags, and package-specific blocking evidence.
- Added reason classification for major-version policy blocks, audit regressions, peer conflicts, resolver limits, deprecated or engine-incompatible candidates, structured overrides, carrier packages, public peer contracts, unknown versions, failed validation, and absence of a safe candidate.
- Added matching Markdown output under `Unresolved Package Guidance`.
- Ensured similarly named packages such as `vite` and `vitest` cannot inherit each other's evidence.
- Added JSON and Markdown output-contract tests plus focused guidance tests; lint and all 53 tests pass.
- Ran JSON and Markdown dry runs against the partially remediated `github-spec-kit-demo` worktree without modifying it.
- Confirmed both real formats report `vitest@1.6.1 -> 4.1.10` and `vite@5.4.20 -> 6.4.3` as `SEMVER_MAJOR_BLOCKED`, recommend `--allow-major`, and require a complete test command.

**Goal:** Make every unresolved finding answer both “why was this not updated?” and “what is the safest next action?” without requiring users to correlate separate report arrays.

Steps:

1. Correlate final audit findings with package-specific skipped decisions and resolver notes.
2. Record the currently locked version and each concrete candidate version attempted or recommended.
3. Assign a stable machine-readable reason code.
4. Generate a conservative next action and only suggest opt-in flags relevant to that reason.
5. Render the same guidance in JSON and Markdown while preserving existing fields.
6. Validate the schema against unit contracts and a real unresolved repository.

Exit criteria:

- [x] existing JSON fields remain available
- [x] every final unresolved finding has one structured guidance entry
- [x] JSON and Markdown contain equivalent guidance
- [x] reason correlation is package-specific
- [x] unit and output-contract tests pass
- [x] a real worktree report demonstrates actionable major-version, peer, or audit-regression guidance

### Phase 14 — Behavioral-gate subset recovery

**Implementation status:** Planned from Mamba League validation; not part of the completed output-guidance patch.

**Progress recorded:**

- Confirmed install and audit validation alone cannot detect every runtime incompatibility from a global transitive override.
- Reproduced `brace-expansion@5.0.8` breaking ESLint's older nested `minimatch` consumer even though npm resolved and installed the graph.
- Confirmed the complete user verification command rejects the batch and the transaction restores both target files byte-for-byte.
- Confirmed `--no-overrides` provides a safe current workaround, retaining the independently valid Vite upgrade.
- Identified the remaining resolver limitation: after final behavioral verification rejects a multi-plan result, the patcher does not bisect or retry smaller plan subsets.

**Goal:** Preserve atomic behavioral validation while recovering the largest bounded subset of changes that passes the complete verification command.

Steps:

1. Keep the existing full-batch verification as the first attempt.
2. On verification failure, restore a fresh staged baseline before every retry.
3. Use bounded binary partitioning of accepted plan groups rather than unbounded combination search.
4. Prioritize critical and high-severity reductions, then direct upgrades, then narrowly scoped overrides.
5. Track a separate verification-subset attempt budget and time bound.
6. Record rejected subsets, implicated plans, accepted subsets, and stopping limits in structured output.
7. Add a fixture where a global override breaks a runtime consumer while an independent direct upgrade remains valid.

Exit criteria:

- [ ] a failing combined behavioral gate never changes the real target
- [ ] the safe independent subset is retried and committed within explicit bounds
- [ ] every retry starts from an uncontaminated staged baseline
- [ ] report output identifies the behaviorally incompatible plan or smallest bounded subset found
- [ ] Mamba League retains safe fixes without requiring `--no-overrides`

Phase 14 is an effectiveness enhancement rather than a release-safety blocker.
The current implementation fails closed, rolls back the complete proposed set,
and now requires application verification unless the operator explicitly accepts
dependency-only validation.

### Phase 15 — Distribution hardening excluding relocation

**Implementation status:** Complete locally. Source relocation, destination
metadata, remote CI, and publication remain intentionally excluded.

**Progress recorded:**

- Set the distribution candidate version to `0.2.0` and added a dated,
  user-facing release entry while retaining an `Unreleased` section.
- Made application verification mandatory in apply mode through
  `--test <command>`.
- Added `--allow-no-test` as an explicit dependency-only acknowledgement and
  reject its use outside apply mode or together with `--test`.
- Exposed the verification choice in public reports and added CLI,
  programmatic-validation, git-policy, integration, and report-contract tests.
- Added an explicit final-report warning whenever `--allow-no-test` accepts
  dependency-only validation.
- Added an isolated low-threshold dependency audit to `check` and `prepack`;
  workspace traversal is disabled so a parent workspace cannot contaminate the
  package's audit result.
- Added public TypeScript declarations, strict source-consumer compilation, and
  strict installed-tarball consumer compilation.
- Tightened conditional exports to the supported ESM API, verified native ESM
  imports and CommonJS dynamic imports, and verified that synchronous
  `require()` fails at the package boundary.
- Added an ESM-only package-resolution analyzer gate to the local release
  command.
- Added a support policy, expanded the security policy, and documented the
  supported package managers, diagnostics, sensitive-data handling, and the
  temporary contact path before destination metadata exists.
- Expanded the tarball inspection to require declarations and all
  documentation/support files.
- Passed `npm run check`, all 53 tests on Node.js 20.20.2, 22.23.1, and
  24.18.0, zero-finding audits with npm 10.9.8 and 11.18.0, npm 10 pack dry
  run, and npm 11 publish dry run.
- Confirmed the package name still returns npm registry `E404` and is not
  currently published.
- Recorded the exact 29-entry candidate's packed/unpacked sizes, SHA-1,
  SHA-256, and npm integrity value in Phase 10.
- Kept repository, homepage, bugs, author/maintainer channel, and remote CI
  metadata unset rather than inventing destination-specific values.

**Goal:** Close every distribution-readiness item that can be completed without
choosing or mutating the final source repository.

Steps:

1. Require behavioral validation for apply mode or an explicit acknowledgement.
2. Integrate a package-local dependency audit into release gates.
3. Publish and validate the public TypeScript contract.
4. Establish a versioned changelog and supported-version security policy.
5. Define support boundaries and a temporary pre-relocation contact path.
6. Validate the exact packed surface from ESM, CommonJS dynamic import, CLI,
   and TypeScript consumers.
7. Record relocation-dependent metadata as deferred rather than using
   placeholders.

Exit criteria:

- [x] unacknowledged apply mode cannot run without an application test
- [x] package-local audit is zero and part of `npm run check` and `prepack`
- [x] declarations resolve and compile from the packed artifact
- [x] the ESM-only package boundary matches the documented consumption model
- [x] `0.2.0` has a dated changelog and supported-version policy
- [x] support and security reporting instructions ship in the tarball
- [x] no destination identity or source metadata was fabricated

## Test matrix

| Area | Required cases |
| --- | --- |
| Working directory | Same cwd, different launcher/target cwd, relative cwd, symlinked cwd |
| Git | Clean, dirty, untracked files, non-git, git command failure |
| Audit | Clean, findings, malformed JSON, error JSON, empty output, timeout, registry failure |
| Transaction | Planning failure, install failure, audit failure, verification failure, signal, concurrent edit |
| Dependencies | Direct, transitive, dev, optional, peer, scoped |
| Versions | Exact, caret, tilde, union, hyphen, wildcard, prerelease, `0.x` |
| Specs | Workspace, npm alias, tag, git, URL, file |
| Security policy | New finding, removed finding, severity increase, range expansion, count decrease with critical introduction |
| Package | Source import, packed import, executable bit, CLI help, dry run, apply |
| Runtime | Every supported Node major and documented npm major |

## Release checklist

- [ ] Package has been moved to its final local folder
- [x] No GitHub repository or remote publication occurred prematurely
- [x] R1 target-directory isolation complete
- [x] R2 whole-run rollback complete
- [x] R3 staged installed-tree verification complete
- [x] R4 semver/package-spec migration complete
- [x] R5 strict audit schema complete
- [x] R6 no-new/no-worse vulnerability policy complete
- [x] R7 CLI/API hardening complete
- [x] R8 local automated gates complete
- [x] Apply mode requires behavioral verification or explicit dependency-only acknowledgement
- [x] Isolated package audit is part of local and prepack gates
- [x] Public TypeScript declarations and packed-consumer checks complete
- [x] Versioned changelog, security policy, and support policy complete
- [ ] R8 remote CI wiring complete after relocation
- [x] R9 local documentation/package metadata complete
- [ ] R9 destination-specific repository/support metadata complete
- [ ] R10 clean reproducible source complete
- [x] Parent application tracked as a separate release workstream
- [x] All local tests and runtime matrices pass
- [x] Packed artifact smoke tests pass
- [x] Publish dry run produces no corrective warnings
- [x] Local code-remediation review says go
- [ ] Final post-relocation release-readiness review says go

## Suggested implementation order summary

```text
Relocate
  -> Write failing safety tests
  -> Unify cwd/execution context
  -> Build staged transaction
  -> Replace semver/spec parsing
  -> Validate audits and compare findings
  -> Harden CLI/API
  -> Remove obsolete code
  -> Add release gates
  -> Complete docs/metadata
  -> Validate release candidate
  -> Configure repository/publication
```

The phases are ordered to prevent tests from locking in the current unsafe architecture and to ensure that no real target mutation is trusted before isolation, staging, audit validation, and rollback are proven.
