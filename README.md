# npm-vuln-patcher

`npm-vuln-patcher` is a conservative npm audit remediation tool. It plans direct dependency upgrades, safe parent upgrades, and narrowly scoped npm overrides, then validates proposed changes before updating a project.

The default mode is a dry run. Real project files are changed only when `--apply` is supplied.

## Requirements

- Node.js 20.19 or newer
- npm 10 or 11
- `package.json` and `package-lock.json` in the target project
- A meaningful project verification command for apply mode, such as `npm test`

Apply mode expects a clean Git worktree by default. Non-Git projects and dirty
worktrees require explicit opt-in flags.

## Install globally with npm

After the package is published to the npm registry, install it globally:

```sh
npm install --global npm-vuln-patcher
```

Until then, npm can install an archive of the current public GitHub repository:

```sh
npm install --global https://github.com/FrescoFlacko/npm-vuln-patcher/archive/refs/heads/main.tar.gz
```

To install from a local clone:

```sh
git clone https://github.com/FrescoFlacko/npm-vuln-patcher.git
cd npm-vuln-patcher
npm ci
npm install --global .
```

Confirm that the CLI is available:

```sh
npm-vuln-patcher --help
npm list --global --depth=0 npm-vuln-patcher
```

Re-run the appropriate install command to update the global installation.
Remove it with:

```sh
npm uninstall --global npm-vuln-patcher
```

## Prepare a target project

The CLI operates on the current working directory; it does not accept a project
path argument. Change into the npm project that you want to inspect:

```sh
cd /path/to/your-project
```

The project must contain both `package.json` and `package-lock.json`. If it does
not have a lockfile yet, generate one with the same npm version used by the
project:

```sh
npm install --package-lock-only
```

Before applying changes, commit or stash existing work and identify a
verification command that exercises the application:

```sh
git status --short
npm test
```

## Quick start

Start with a dry run. This audits the current project and prints a remediation
plan without changing its files:

```sh
npm-vuln-patcher
```

Choose a minimum severity when needed:

```sh
npm-vuln-patcher --severity high
```

For automation, request one JSON document:

```sh
npm-vuln-patcher --severity high --format json
```

Apply validated changes in a clean Git worktree. The verification command runs
against the staged dependency tree before the real manifest and lockfile are
updated:

```sh
npm-vuln-patcher --apply --severity high --test "npm test"
```

Replace `npm test` with the strongest practical command for the target, for
example:

```sh
npm-vuln-patcher --apply --test "npm run lint && npm test && npm run build"
```

Apply in a non-Git project intentionally:

```sh
npm-vuln-patcher --apply --allow-non-git --test "npm test"
```

Apply mode requires an application verification command. Dependency-only
validation is available only through an explicit acknowledgement:

```sh
npm-vuln-patcher --apply --allow-no-test
```

`--allow-no-test` verifies npm resolution, the audit policy, and a clean staged
install, but it cannot detect application-level runtime incompatibilities. The
final report records this acknowledgement explicitly.

Exit code `2` means vulnerabilities at or above the selected severity remain;
it does not necessarily mean the CLI failed to run. See [Exit codes](#exit-codes)
for the complete contract.

## Safety model

Apply mode:

1. Resolves one absolute target directory.
2. Checks git state before any project-file mutation.
3. Copies the project into a private temporary staging directory, excluding `.git`, `node_modules`, common build output, coverage, `.env` files, and symbolic links.
4. Plans and validates changes only in staging.
5. Groups vulnerable, peer-coupled root packages and asks npm to resolve each complete cohort.
6. Sorts registry range results semantically and rejects candidates incompatible with the running Node version.
7. Runs strict npm audit validation and rejects new or worsened findings.
8. Retries a root cohort from a fresh staging lockfile if incremental resolution fails or does not improve the audit.
9. Rejects newly deprecated candidates; an already-deprecated root may move to a security-improving version carrying the same deprecation state.
10. Runs `npm ci --ignore-scripts` in staging by default.
11. Runs the required verification command against the staged installed dependency tree, unless dependency-only validation was explicitly acknowledged.
12. Confirms the real manifest and lockfile were not concurrently changed.
13. Commits only `package.json` and `package-lock.json`.

If staging, audit, install, or verification fails, the real manifest and lockfile remain byte-for-byte unchanged. A short-lived lock file prevents concurrent patcher runs. The commit path restores both original files if a two-file commit operation fails.

Abrupt process termination such as `SIGKILL`, filesystem failure, or machine loss cannot be made perfectly atomic across two ordinary files. Keep the project under source control or another backup system.

## Install-script policy

Staged `npm ci` disables dependency lifecycle scripts by default. Use `--allow-install-scripts` only when verification genuinely requires them and the dependency tree is trusted enough to execute them.

## Supported dependency specifications

Automatic direct-spec rewrites support:

- exact semantic versions
- caret ranges
- tilde ranges

Ambiguous ranges, workspace protocols, npm aliases, tags, git dependencies, URLs, and file dependencies are reported and skipped rather than silently rewritten. Existing transitive overrides can still be planned when npm supplies a concrete safe version.

## Options

Run `npm-vuln-patcher --help` for the complete list. Important controls include:

- `--apply`: opt into validated writes
- `--severity <level>`: minimum severity from `info` through `critical`
- `--allow-major`: permit major-version candidates
- `--no-overrides`: disable override fallback
- `--allow-dirty`: permit apply in a dirty git worktree
- `--allow-non-git`: permit apply outside git
- `--test <command>`: run a staged verification command
- `--allow-no-test`: explicitly accept dependency-only validation without an application test
- `--format markdown|json`: choose human or automation output
- `--max-parent-versions <n>`: inspect up to five parent versions by default; increase the bound for a deeper, slower search
- `--peer-check-depth <n>`: bound legacy parent-candidate peer inspection; default one level
- `--max-peer-closure-rounds <n>`: bound direct-root peer closure; default three rounds
- `--max-packages-per-group <n>`: cap coordinated root cohorts; default 24 packages
- `--max-candidates-per-package <n>`: cap representative fallback candidates; default three
- `--max-resolver-attempts-per-group <n>`: cap npm resolution attempts for a group; default six
- `--max-fixpoint-passes <n>`: cap re-audit and re-planning passes; default three
- `--no-lock-refresh`: disable the controlled fresh-lock retry for coordinated root cohorts
- `--timeout-ms <n>`: bound external command execution

Peer closure is deliberately shallow and broad: the patcher reads peer metadata only for direct root packages. npm performs the full transitive dependency solve during each bounded staging attempt, so ordinary dependency trees are not recursively crawled through registry metadata.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Operation completed and the configured vulnerability policy is satisfied |
| `1` | Operational, audit-contract, registry, or transaction failure |
| `2` | Vulnerabilities remain at or above the configured severity |
| `3` | Invalid CLI or programmatic input |
| `4` | Staged verification command failed and changes were rolled back |

## Programmatic API

The package ships TypeScript declarations for its public ESM API. CommonJS
consumers must use dynamic `import('npm-vuln-patcher')`; synchronous `require()`
is not supported.

```js
import { runNpmVulnPatcher } from 'npm-vuln-patcher';

const report = await runNpmVulnPatcher({
  cwd: '/absolute/path/to/project',
  options: {
    apply: false,
    severity: 'high',
    format: 'json',
  },
});

process.exitCode = report.exitCode;
```

The `cwd` boundary is mandatory in practice: every npm, git, registry, install, and verification subprocess runs in the resolved target or its private staging copy.

## Reports

Markdown is the default. JSON mode writes one JSON document without progress log lines. Reports distinguish:

- planned or accepted fixes
- overrides
- skipped changes
- remaining vulnerabilities
- consolidated unresolved-package guidance
- group resolution attempts, lock refreshes, fixpoint passes, and install/test verification
- committed, dry-run, failed, or rolled-back status

Audit or registry errors are never reported as a clean audit.

The JSON report retains the legacy `remaining`, `skipped`, and `notes` arrays and
also includes an additive `unresolved` array. Each unresolved entry contains:

- package name, current version, severity, and vulnerable range
- attempted package/version updates
- a stable reason code and human-readable reason
- a safe suggested action and relevant opt-in flags
- package-specific blocking evidence

Markdown output renders the same information under `Unresolved Package
Guidance`, keeping the rejection reason and next action together.

## Limitations

- Only npm `package-lock.json` projects are supported.
- Candidate discovery depends on the configured npm registry.
- Larger candidate windows, peer-closure bounds, and fixpoint limits can increase registry and npm resolution time.
- Automated fixes cannot prove application-level API compatibility; use a meaningful verification command.
- A final behavioral verification failure rolls back the complete proposed set; automatic verification-based subset recovery is not yet implemented.
- Lifecycle scripts are disabled unless explicitly enabled.
- Unresolved vulnerabilities require manual dependency or application changes.
- Publishing this package does not remediate vulnerabilities in the application repository that contains it.

## Development

```sh
npm install --workspaces=false
npm run check
```

`npm run check` runs linting, an isolated dependency audit, contract/integration
tests, TypeScript declaration checks, tarball inspection, installed-CLI smoke
tests, installed-type consumer checks, ESM package-resolution analysis, and
public imports from both ESM and CommonJS contexts.

## Security

See [SECURITY.md](SECURITY.md). Do not include registry credentials, tokens, private `.npmrc` content, or sensitive project files in reports.

## Support

See [SUPPORT.md](SUPPORT.md) for supported environments and the information to
include in a support request.

## License

MIT
