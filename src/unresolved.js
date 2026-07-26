import { normalizeFix } from './audit.js';
import { findLockedVersion } from './manifest.js';

const REASON_CODES = Object.freeze({
  SEMVER_MAJOR_BLOCKED: 'SEMVER_MAJOR_BLOCKED',
  AUDIT_REGRESSION: 'AUDIT_REGRESSION',
  PEER_DEPENDENCY_CONFLICT: 'PEER_DEPENDENCY_CONFLICT',
  RESOLVER_ATTEMPT_LIMIT: 'RESOLVER_ATTEMPT_LIMIT',
  DEPRECATED_CANDIDATE: 'DEPRECATED_CANDIDATE',
  ENGINE_INCOMPATIBLE: 'ENGINE_INCOMPATIBLE',
  STRUCTURED_OVERRIDE_CONFLICT: 'STRUCTURED_OVERRIDE_CONFLICT',
  CARRIER_PACKAGE: 'CARRIER_PACKAGE',
  PUBLIC_PEER_CONTRACT: 'PUBLIC_PEER_CONTRACT',
  CURRENT_VERSION_UNKNOWN: 'CURRENT_VERSION_UNKNOWN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NO_SAFE_CANDIDATE: 'NO_SAFE_CANDIDATE',
  UNRESOLVED: 'UNRESOLVED',
});

export function buildUnresolvedGuidance({
  vulnerabilities,
  report,
  lockfile,
  options,
}) {
  return vulnerabilities.map((vulnerability) => {
    const currentVersion = findLockedVersion(vulnerability.name, lockfile);
    const skipped = unique(report.skipped.filter((entry) => referencesPackage(entry, vulnerability.name)));
    const notes = unique(report.notes.filter((entry) => referencesPackage(entry, vulnerability.name)));
    const evidence = unique([...skipped, ...notes]);
    const fix = normalizeFix(vulnerability.fixAvailable);
    const reasonCode = classifyReason({ evidence, fix, options });
    const reason = skipped[0]
      || notes[0]
      || defaultReason(vulnerability.name, reasonCode);

    return {
      package: vulnerability.name,
      severity: vulnerability.severity,
      vulnerableRange: vulnerability.range || null,
      currentVersion,
      attemptedUpdates: collectAttemptedUpdates({
        packageName: vulnerability.name,
        currentVersion,
        fix,
        evidence,
      }),
      reasonCode,
      reason,
      suggestedAction: suggestedAction(reasonCode, vulnerability.name),
      suggestedFlags: suggestedFlags(reasonCode, evidence),
      blockingEvidence: evidence.filter((entry) => entry !== reason).slice(0, 5),
    };
  });
}

function classifyReason({ evidence, fix, options }) {
  const text = evidence.join('\n');

  if (
    /crosses a major version/i.test(text)
    || (fix.isSemVerMajor && !options.allowMajor)
  ) {
    return REASON_CODES.SEMVER_MAJOR_BLOCKED;
  }
  if (
    /resulting audit did not improve without regressions/i.test(text)
    || /vulnerable range expanded/i.test(text)
    || /introduced (?:as )?a new .* vulnerability/i.test(text)
    || /introduced new advisory/i.test(text)
    || /severity increased/i.test(text)
  ) {
    return REASON_CODES.AUDIT_REGRESSION;
  }
  if (
    /peer dependency conflict/i.test(text)
    || /conflicting peer dependency/i.test(text)
    || /declares peerDependencies/i.test(text)
  ) {
    return REASON_CODES.PEER_DEPENDENCY_CONFLICT;
  }
  if (/resolver-attempt limit/i.test(text)) {
    return REASON_CODES.RESOLVER_ATTEMPT_LIMIT;
  }
  if (/deprecated/i.test(text)) {
    return REASON_CODES.DEPRECATED_CANDIDATE;
  }
  if (/requires Node/i.test(text)) {
    return REASON_CODES.ENGINE_INCOMPATIBLE;
  }
  if (/structured override/i.test(text)) {
    return REASON_CODES.STRUCTURED_OVERRIDE_CONFLICT;
  }
  if (/carrier package/i.test(text)) {
    return REASON_CODES.CARRIER_PACKAGE;
  }
  if (/peerDependencies are public compatibility contracts/i.test(text)) {
    return REASON_CODES.PUBLIC_PEER_CONTRACT;
  }
  if (/current (?:parent )?version .*cannot be determined/i.test(text)) {
    return REASON_CODES.CURRENT_VERSION_UNKNOWN;
  }
  if (/failed install\/audit validation/i.test(text) || /candidate .* failed .*validation/i.test(text)) {
    return REASON_CODES.VALIDATION_FAILED;
  }
  if (
    /no .*safe .*upgrade/i.test(text)
    || /no parent upgrade or override fallback/i.test(text)
    || /no non-deprecated override candidate/i.test(text)
  ) {
    return REASON_CODES.NO_SAFE_CANDIDATE;
  }

  return REASON_CODES.UNRESOLVED;
}

function suggestedAction(reasonCode, packageName) {
  switch (reasonCode) {
    case REASON_CODES.SEMVER_MAJOR_BLOCKED:
      return 'Review the major-version migration, then rerun with --allow-major and a complete --test command.';
    case REASON_CODES.AUDIT_REGRESSION:
      return 'Do not force the rejected candidate. Select a non-regressing release, migrate the coupled root cohort, or replace the dependency.';
    case REASON_CODES.PEER_DEPENDENCY_CONFLICT:
      return 'Align the listed peer dependencies as one compatible root cohort, validate the application, and rerun.';
    case REASON_CODES.RESOLVER_ATTEMPT_LIMIT:
      return 'Increase --max-resolver-attempts-per-group by a small amount and rerun with the same validation command.';
    case REASON_CODES.DEPRECATED_CANDIDATE:
      return 'Select a newer non-deprecated release or replace the dependency.';
    case REASON_CODES.ENGINE_INCOMPATIBLE:
      return 'Use a candidate compatible with the current Node runtime, or validate an intentional Node runtime upgrade first.';
    case REASON_CODES.STRUCTURED_OVERRIDE_CONFLICT:
      return 'Review and update the existing structured override manually, then run a clean install, audit, and application tests.';
    case REASON_CODES.CARRIER_PACKAGE:
      return `Run npm explain ${packageName}, then upgrade or replace the direct parent that introduces it.`;
    case REASON_CODES.PUBLIC_PEER_CONTRACT:
      return 'Update the peer dependency range manually as an intentional public API change, then validate downstream consumers.';
    case REASON_CODES.CURRENT_VERSION_UNKNOWN:
      return 'Repair or regenerate the npm lockfile so the installed version can be determined, then rerun.';
    case REASON_CODES.VALIDATION_FAILED:
      return 'Inspect the failed install or audit evidence, correct the dependency conflict, and rerun with full validation.';
    case REASON_CODES.NO_SAFE_CANDIDATE:
      return `Run npm explain ${packageName}, then upgrade or replace its direct parent, or wait for a safe upstream release.`;
    default:
      return `Run npm explain ${packageName}, inspect the skipped decisions and dependency path, then choose a manually validated parent upgrade or replacement.`;
  }
}

function suggestedFlags(reasonCode, evidence) {
  if (reasonCode === REASON_CODES.SEMVER_MAJOR_BLOCKED) return ['--allow-major'];
  if (reasonCode === REASON_CODES.RESOLVER_ATTEMPT_LIMIT) {
    return ['--max-resolver-attempts-per-group <higher-value>'];
  }
  if (
    reasonCode === REASON_CODES.PEER_DEPENDENCY_CONFLICT
    && evidence.some((entry) => /declares peerDependencies/i.test(entry))
  ) {
    return ['--allow-peer-dependency-candidates'];
  }
  return [];
}

function collectAttemptedUpdates({
  packageName,
  currentVersion,
  fix,
  evidence,
}) {
  const updates = [];
  const add = (name, version) => {
    const normalized = normalizeVersion(version);
    if (!name || !normalized || (name === packageName && normalized === currentVersion)) return;
    if (!updates.some((entry) => entry.package === name && entry.version === normalized)) {
      updates.push({ package: name, version: normalized });
    }
  };

  if (fix.version) add(fix.name || packageName, fix.version);

  for (const entry of evidence) {
    const parentMatch = entry.match(/parent upgrade\s+([@A-Za-z0-9._/-]+)\s+\S+\s+->\s+[\^~]?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/i);
    if (parentMatch) add(parentMatch[1], parentMatch[2]);

    const arrowMatch = entry.match(/->\s+[\^~]?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/);
    if (arrowMatch) add(packageName, arrowMatch[1]);

    const overrideMatch = entry.match(/add override to\s+([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/i);
    if (overrideMatch) add(packageName, overrideMatch[1]);

    const packageVersionPattern = new RegExp(
      `${escapeRegExp(packageName)}@([0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)`,
      'g',
    );
    for (const match of entry.matchAll(packageVersionPattern)) add(packageName, match[1]);
  }

  return updates;
}

function referencesPackage(entry, packageName) {
  if (entry.startsWith(`${packageName}:`)) return true;
  const escaped = escapeRegExp(packageName);
  return new RegExp(`(?:^|[\\s(,])${escaped}(?:@|\\b)`).test(entry);
}

function defaultReason(packageName, reasonCode) {
  if (reasonCode === REASON_CODES.SEMVER_MAJOR_BLOCKED) {
    return `${packageName}: npm reports that the available fix requires a major-version upgrade.`;
  }
  return `${packageName}: no accepted automatic remediation was recorded within the configured policy and bounds.`;
}

function normalizeVersion(version) {
  return typeof version === 'string' ? version.replace(/^[\^~]/, '') : null;
}

function unique(items) {
  return [...new Set(items)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { REASON_CODES };
