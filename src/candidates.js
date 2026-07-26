import { candidateHasAllowedPeers, resolveBestVersion } from './peer-policy.js';
import { getDeprecationMessage, npmViewJson } from './npm.js';
import { compareVersions, isPrereleaseVersion, majorOf } from './semver.js';

export function getBoundedUpgradeCandidates({
  context,
  packageName,
  minimumVersion,
  currentVersion,
  options,
}) {
  const versions = getPackageVersions(context, packageName) || [];
  const eligible = versions
    .filter((version) => !isPrereleaseVersion(version))
    .filter((version) => compareVersions(version, minimumVersion) >= 0)
    .filter((version) => !currentVersion || compareVersions(version, currentVersion) > 0)
    .sort(compareVersions);
  const minimumMajor = majorOf(minimumVersion);
  const sameSafeMajor = eligible.filter((version) => majorOf(version) === minimumMajor);
  const shortlist = [
    sameSafeMajor.at(-1),
    minimumVersion,
    options.allowMajor ? eligible.at(-1) : null,
  ].filter(Boolean);

  return [...new Set(shortlist)].slice(0, options.maxCandidatesPerPackage || 3);
}

export function findFirstParentVersionWithPatchedDependency({
  parentName,
  currentVersion,
  vulnerableName,
  fixedVersion,
  rootDependencySpecs,
  validateCandidate,
  dependencyUpdate,
  context,
  options,
  report,
}) {
  const versions = getPackageVersions(context, parentName);
  if (!versions) return null;

  for (const candidate of getCandidateVersions({ versions, currentVersion, options })) {
    const dependencies = getDependencies(context, `${parentName}@${candidate}`);
    const range = dependencies?.[vulnerableName];

    if (!range) continue;

    if (!candidateHasAllowedPeers({
      packageName: parentName,
      version: candidate,
      rootDependencySpecs,
      maxDepth: options.peerCheckDepth,
      skipPeerDependencyCandidates: options.skipPeerDependencyCandidates,
      report,
      context,
    })) {
      continue;
    }

    if (rejectDeprecatedCandidate(context, parentName, candidate, report)) {
      continue;
    }

    const bestResolved = resolveBestVersion(context, vulnerableName, range);

    if (bestResolved && compareVersions(bestResolved, fixedVersion) >= 0) {
      if (validateCandidate({ dependencyUpdate, candidate, targetName: vulnerableName })) {
        return candidate;
      }
    }
  }

  return null;
}

export function findFirstPackageVersionWithoutDependencies({
  packageName,
  currentVersion,
  dependencyNames,
  targetName,
  rootDependencySpecs,
  validateCandidate,
  dependencyUpdate,
  context,
  options,
  report,
}) {
  const versions = getPackageVersions(context, packageName);
  if (!versions) return null;

  for (const candidate of getCandidateVersions({ versions, currentVersion, options })) {
    const dependencies = getDependencies(context, `${packageName}@${candidate}`);

    if (dependencyNames.some((name) => dependencies?.[name])) {
      continue;
    }

    if (!candidateHasAllowedPeers({
      packageName,
      version: candidate,
      rootDependencySpecs,
      maxDepth: options.peerCheckDepth,
      skipPeerDependencyCandidates: options.skipPeerDependencyCandidates,
      report,
      context,
    })) {
      continue;
    }

    if (rejectDeprecatedCandidate(context, packageName, candidate, report)) {
      continue;
    }

    if (validateCandidate({ dependencyUpdate, candidate, targetName })) {
      return candidate;
    }
  }

  return null;
}

function getPackageVersions(context, packageName) {
  const versions = npmViewJson(context, packageName, 'versions');
  return Array.isArray(versions) ? versions : null;
}

function getDependencies(context, packageSpecifier) {
  return npmViewJson(context, packageSpecifier, 'dependencies') || {};
}

function rejectDeprecatedCandidate(context, packageName, version, report) {
  const deprecation = getDeprecationMessage(context, packageName, version);
  if (!deprecation) return false;
  report?.notes.push(`Skipping deprecated ${packageName}@${version}: ${deprecation}`);
  return true;
}

function getCandidateVersions({ versions, currentVersion, options }) {
  const currentMajor = majorOf(currentVersion);
  const candidates = versions
    .filter((version) => !isPrereleaseVersion(version))
    .filter((version) => compareVersions(version, currentVersion) > 0)
    .filter((version) => options.allowMajor || majorOf(version) === currentMajor)
    .sort(compareVersions);

  if (!options.allowMajor) {
    return candidates.slice(0, options.maxParentVersions);
  }

  const sameMajor = candidates.filter((version) => majorOf(version) === currentMajor);
  const nextMajor = candidates.filter((version) => majorOf(version) !== currentMajor);

  return [...sameMajor.slice(0, options.maxParentVersions), ...nextMajor.slice(0, options.maxParentVersions)];
}
