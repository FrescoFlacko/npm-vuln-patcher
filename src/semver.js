import semver from 'semver';

function coerceVersion(value) {
  if (!value) return null;

  const exact = semver.valid(String(value), { loose: true });
  if (exact) return exact;

  return semver.coerce(String(value), { includePrerelease: true, loose: true })?.version || null;
}

export function compareVersions(a, b) {
  return semver.compare(requireVersion(a), requireVersion(b));
}

export function majorOf(version) {
  const parsed = semver.parse(coerceVersion(version));
  return parsed?.major ?? null;
}

export function crossesMajor(currentVersion, nextVersion) {
  const currentMajor = majorOf(currentVersion);
  const nextMajor = majorOf(nextVersion);
  return currentMajor !== null && nextMajor !== null && currentMajor !== nextMajor;
}

export function isPrereleaseVersion(version) {
  const valid = semver.valid(String(version), { loose: true });
  return valid ? semver.prerelease(valid) !== null : false;
}

export function rangesMayOverlap(rootRange, peerRange) {
  const first = semver.validRange(rootRange, { loose: true });
  const second = semver.validRange(peerRange, { loose: true });

  if (!first || !second) return false;
  return semver.intersects(first, second, { includePrerelease: true, loose: true });
}

export function rangeIsSubset(candidateRange, baselineRange) {
  const candidate = semver.validRange(candidateRange, { loose: true });
  const baseline = semver.validRange(baselineRange, { loose: true });

  if (!candidate || !baseline) return candidateRange === baselineRange;
  return semver.subset(candidate, baseline, { includePrerelease: true, loose: true });
}

function requireVersion(value) {
  const version = semver.valid(String(value), { loose: true }) || coerceVersion(value);
  if (!version) {
    throw new Error(`Invalid semantic version: ${value}`);
  }
  return version;
}
