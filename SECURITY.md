# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `0.2.x` | Yes |
| `<0.2.0` | No |

Security support covers the unmodified package artifact distributed by the
maintainer. Forks and locally patched builds are supported by their distributor.

## Reporting a vulnerability

Do not open a public issue containing exploit details, registry credentials,
tokens, private package names, `.npmrc` contents, or proprietary dependency
graphs.

Use the private security-reporting channel linked by the package repository. If
repository metadata has not yet been assigned, contact the person or team that
provided the approved artifact and request a private reporting channel without
including exploit details in the initial message. Internal artifact recipients
should use the private channel through which the artifact was distributed.

Include:

- affected package version and artifact integrity hash
- minimal reproduction using non-sensitive fixture data
- expected and actual file changes
- npm and Node.js versions
- whether the issue can modify the wrong project, bypass rollback, execute
  scripts, or hide an audit failure

The maintainer will acknowledge receipt through the same private channel. No
public response-time SLA is promised until destination-specific support metadata
is assigned.

## Security guarantees

Apply mode is designed to:

- operate on one resolved target directory
- require an application verification command unless dependency-only
  validation is explicitly acknowledged
- validate changes in a private staging workspace
- fail closed on malformed audit or registry responses
- reject new or worsened vulnerabilities
- preserve real manifest and lockfile bytes on validation failure
- disable dependency lifecycle scripts unless explicitly allowed

Machine failure and `SIGKILL` cannot guarantee perfect two-file atomicity. Keep
projects under source control or an equivalent backup system.
