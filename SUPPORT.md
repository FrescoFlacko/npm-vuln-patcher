# Support

## Supported environments

- Node.js `20.19` or newer
- npm `10` or `11`
- npm projects containing `package.json` and `package-lock.json`

pnpm, Yarn, Bun, and projects without an npm lockfile are outside the current
support scope.

## Requesting help

Use the support channel linked by the package repository or the private channel
through which an internal artifact was distributed. Until final repository
metadata is assigned, contact the person or team that provided the approved
artifact.

Provide:

- `npm-vuln-patcher` version
- Node.js and npm versions
- the exact CLI options used
- exit code and redacted JSON report
- whether the target is a Git worktree
- a minimal non-sensitive reproduction when possible

Never include authentication tokens, private registry URLs containing
credentials, `.npmrc` contents, or proprietary package names that cannot be
shared.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not a general
support channel.
