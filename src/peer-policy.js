import { npmViewJson } from './npm.js';
import { compareVersions, isPrereleaseVersion, rangesMayOverlap } from './semver.js';

export function candidateHasAllowedPeers({
  packageName,
  version,
  rootDependencySpecs,
  maxDepth,
  skipPeerDependencyCandidates,
  report,
  context,
}) {
  const peerIssues = findPeerIssues(
    context,
    packageName,
    version,
    rootDependencySpecs,
    maxDepth,
    skipPeerDependencyCandidates,
  );

  if (skipPeerDependencyCandidates && peerIssues.declarations.length) {
    const details = peerIssues.declarations
      .slice(0, 2)
      .map((issue) => `${issue.packageName} declares ${issue.peerName}@${issue.peerRange}`)
      .join('; ');
    const message = `Skipping ${packageName}@${version}; candidate tree declares peerDependencies: ${details}`;

    report?.notes.push(message);
    return false;
  }

  if (peerIssues.conflicts.length) {
    const details = peerIssues.conflicts
      .slice(0, 2)
      .map((conflict) => `${conflict.packageName} requires ${conflict.peerName}@${conflict.peerRange}, root has ${conflict.rootSpec}`)
      .join('; ');
    const message = `Skipping ${packageName}@${version}; peer conflict: ${details}`;

    report?.notes.push(message);
    return false;
  }

  return true;
}

function findPeerIssues(context, packageName, version, rootDependencySpecs, maxDepth, stopOnDeclaration) {
  const declarations = [];
  const conflicts = [];
  const visited = new Set();
  const queue = [{ packageName, version, depth: 0 }];

  while (queue.length) {
    const item = queue.shift();
    const key = `${item.packageName}@${item.version}`;

    if (visited.has(key) || item.depth > maxDepth) continue;
    visited.add(key);

    const packageSpecifier = `${item.packageName}@${item.version}`;
    const peerDependencies = npmViewJson(context, packageSpecifier, 'peerDependencies') || {};
    const peerDependenciesMeta = Object.keys(peerDependencies).length
      ? npmViewJson(context, packageSpecifier, 'peerDependenciesMeta') || {}
      : {};

    for (const [peerName, peerRange] of Object.entries(peerDependencies)) {
      const rootSpec = rootDependencySpecs.get(peerName);
      const optional = Boolean(peerDependenciesMeta?.[peerName]?.optional);
      const declaration = {
        packageName: `${item.packageName}@${item.version}`,
        peerName,
        peerRange,
        rootSpec: rootSpec || 'not installed at root',
        optional,
      };

      declarations.push(declaration);

      if ((!rootSpec && !optional) || (rootSpec && !rangesMayOverlap(rootSpec, peerRange))) {
        conflicts.push(declaration);
      }
    }

    if ((stopOnDeclaration && declarations.length) || conflicts.length) {
      return { declarations, conflicts };
    }

    if (item.depth === maxDepth) continue;

    const dependencies = npmViewJson(context, packageSpecifier, 'dependencies') || {};
    for (const [dependencyName, dependencyRange] of Object.entries(dependencies)) {
      const dependencyVersion = resolveMinimumVersion(context, dependencyName, dependencyRange);

      if (dependencyVersion) {
        queue.push({
          packageName: dependencyName,
          version: dependencyVersion,
          depth: item.depth + 1,
        });
      }
    }
  }

  return { declarations, conflicts };
}

export function resolveBestVersion(context, packageName, range) {
  const result = viewMatchingVersions(context, packageName, range);
  return Array.isArray(result) ? sortRegistryVersions(result).at(-1) || null : typeof result === 'string' ? result : null;
}

export function resolveMinimumVersion(context, packageName, range) {
  const result = viewMatchingVersions(context, packageName, range);
  if (!Array.isArray(result)) return typeof result === 'string' ? result : null;
  const sorted = sortRegistryVersions(result);
  return sorted.find((version) => !isPrereleaseVersion(version)) || sorted[0] || null;
}

function viewMatchingVersions(context, packageName, range) {
  try {
    return npmViewJson(context, `${packageName}@${range}`, 'version');
  } catch (error) {
    if (error?.code === 'COMMAND_FAILED' && /\bE404\b[\s\S]*No match found for version/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

function sortRegistryVersions(versions) {
  return versions
    .filter((version) => typeof version === 'string')
    .sort(compareVersions);
}
