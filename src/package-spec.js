import npa from 'npm-package-arg';
import semver from 'semver';

export function updateDependencySpec(packageName, currentSpec, nextVersion) {
  const version = semver.valid(String(nextVersion), { loose: true });
  if (!version) {
    return rejected(`candidate "${nextVersion}" is not a valid semantic version`);
  }

  let parsed;
  try {
    parsed = npa.resolve(packageName, currentSpec);
  } catch (error) {
    return rejected(`cannot parse current spec "${currentSpec}": ${error.message}`);
  }

  if (parsed.type === 'version') {
    return accepted(version);
  }

  if (parsed.type !== 'range') {
    return rejected(`spec type "${parsed.type}" is not safely rewritable`);
  }

  const raw = String(parsed.rawSpec).trim();
  if (raw.startsWith('^')) return accepted(`^${version}`);
  if (raw.startsWith('~')) return accepted(`~${version}`);
  if (semver.valid(raw, { loose: true })) return accepted(version);

  return rejected(`range "${currentSpec}" has no unambiguous update style`);
}

export function versionFromDependencySpec(packageName, spec) {
  try {
    const parsed = npa.resolve(packageName, spec);
    if (parsed.type === 'version') return semver.valid(parsed.fetchSpec, { loose: true });
    if (parsed.type !== 'range') return null;
    return semver.minVersion(parsed.fetchSpec, { loose: true })?.version || null;
  } catch {
    return null;
  }
}

function accepted(spec) {
  return { ok: true, spec };
}

function rejected(reason) {
  return { ok: false, reason };
}
