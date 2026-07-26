import semver from 'semver';
import { normalizeFix } from './audit.js';
import {
  findFirstPackageVersionWithoutDependencies,
  findFirstParentVersionWithPatchedDependency,
  getBoundedUpgradeCandidates,
} from './candidates.js';
import { findLockedVersion, packageNameFromNodeModulesPath } from './manifest.js';
import { getDeprecationMessage, npmViewJson } from './npm.js';
import { updateDependencySpec } from './package-spec.js';
import { resolveMinimumVersion } from './peer-policy.js';
import { compareVersions, crossesMajor } from './semver.js';

export function resolveVulnerability({
  vulnerability,
  vulnerabilityMap,
  lockfile,
  directDeps,
  rootDependencySpecs,
  validateCandidate,
  context,
  existingOverrides,
  options,
  report,
}) {
  const plan = createPlan();
  plan.targetNames.push(vulnerability.name);
  const currentSpec = directDeps.get(vulnerability.name);
  const fix = normalizeFix(vulnerability.fixAvailable);
  const ownPatchedVersion = getOwnPatchedVersion(context, vulnerability, fix);
  const directCurrent = Boolean(currentSpec && vulnerability.isDirect && hasRootVulnerableNode(vulnerability));

  if (directCurrent) {
    if (currentSpec.section === 'peerDependencies') {
      plan.skipped.push(`${vulnerability.name}: peerDependencies are public compatibility contracts and are not rewritten automatically.`);
      return plan;
    }
    const currentVersion = findLockedVersion(vulnerability.name, lockfile) || currentSpec.version;
    if (!currentVersion) {
      plan.skipped.push(`${vulnerability.name}: current version cannot be determined from its manifest and lockfile.`);
      return plan;
    }
    const patchedVersion = ownPatchedVersion || findDirectAggregateUpgrade({
      vulnerability,
      vulnerabilityMap,
      currentVersion,
      rootDependencySpecs,
      validateCandidate,
      currentSpec,
      options,
      report,
      context,
    });

    return planDirectUpgrade({
      plan,
      vulnerability,
      currentSpec,
      currentVersion,
      patchedVersion,
      fix,
      validateCandidate,
      context,
      options,
    });
  }

  const recommended = planNpmRecommendedParent({
    plan,
    vulnerability,
    fix,
    directDeps,
    lockfile,
    validateCandidate,
    context,
    options,
  });
  if (recommended) return plan;

  if (options.preferParentUpgrade) {
    const parentUpgrade = findParentUpgrade({
      vulnerability,
      vulnerabilityMap,
      lockfile,
      directDeps,
      rootDependencySpecs,
      validateCandidate,
      options,
      report,
      context,
    });

    if (parentUpgrade) {
      addDependencyUpdate(plan, parentUpgrade.name, parentUpgrade.section, parentUpgrade.nextSpec);
      plan.fixed.push(`${vulnerability.name}: upgrade parent ${parentUpgrade.name} from ${parentUpgrade.currentSpec} to ${parentUpgrade.nextSpec}.`);
      return plan;
    }
  }

  if (options.fallbackOverrides && ownPatchedVersion && (!fix.name || fix.name === vulnerability.name)) {
    if (Object.hasOwn(existingOverrides, vulnerability.name) && typeof existingOverrides[vulnerability.name] !== 'string') {
      plan.skipped.push(`${vulnerability.name}: existing structured override cannot be safely replaced automatically.`);
      return plan;
    }
    const currentVersion = findLockedVersion(vulnerability.name, lockfile);
    const candidates = getBoundedUpgradeCandidates({
      context,
      packageName: vulnerability.name,
      minimumVersion: ownPatchedVersion,
      currentVersion,
      options,
    }).filter((version) => {
      if (getDeprecationMessage(context, vulnerability.name, version)) return false;
      return candidateSupportsCurrentNode(context, vulnerability.name, version, report);
    });
    if (!candidates.length) {
      const deprecation = getDeprecationMessage(context, vulnerability.name, ownPatchedVersion);
      plan.skipped.push(deprecation
        ? `${vulnerability.name}: rejected deprecated override ${ownPatchedVersion}: ${deprecation}`
        : `${vulnerability.name}: no non-deprecated override candidate was available.`);
      return plan;
    }
    plan.overrideCandidateVersions.set(vulnerability.name, candidates);
    plan.overrideUpdates.set(vulnerability.name, candidates[0]);
    plan.overrides.push(`${vulnerability.name}: add override to ${candidates[0]}.`);
    return plan;
  }

  if (!ownPatchedVersion && hasCarrierVia(vulnerability)) {
    plan.skipped.push(`${vulnerability.name}: carrier package; no parent version was found that removes it and no safe override can target a carrier package directly.`);
    return plan;
  }

  plan.skipped.push(`${vulnerability.name}: no parent upgrade or override fallback was available.`);
  return plan;
}

function createPlan() {
  return {
    kind: 'single',
    targetNames: [],
    allowLockRefresh: false,
    fixed: [],
    overrides: [],
    skipped: [],
    dependencyUpdates: new Map(),
    overrideUpdates: new Map(),
    overrideCandidateVersions: new Map(),
  };
}

function planDirectUpgrade({
  plan,
  vulnerability,
  currentSpec,
  currentVersion,
  patchedVersion,
  fix,
  validateCandidate,
  context,
  options,
}) {
  if (!patchedVersion || (fix.name && fix.name !== vulnerability.name && fix.version)) {
    plan.skipped.push(`${vulnerability.name}: direct package is vulnerable through dependencies, but npm did not provide a concrete safe version and no safe aggregate upgrade was found.`);
    return plan;
  }

  if (compareVersions(patchedVersion, currentVersion) <= 0) {
    plan.skipped.push(`${vulnerability.name}: npm recommended ${patchedVersion}, which is not newer than current ${currentVersion}.`);
    return plan;
  }

  if (!options.allowMajor && crossesMajor(currentVersion, patchedVersion)) {
    plan.skipped.push(`${vulnerability.name}: direct upgrade ${currentVersion} -> ${patchedVersion} crosses a major version.`);
    return plan;
  }

  const deprecation = getDeprecationMessage(context, vulnerability.name, patchedVersion);
  if (deprecation) {
    plan.skipped.push(`${vulnerability.name}: rejected deprecated direct upgrade ${patchedVersion}: ${deprecation}`);
    return plan;
  }

  if (fix.version && !validateCandidate({
    dependencyUpdate: {
      name: vulnerability.name,
      section: currentSpec.section,
      currentSpec: currentSpec.raw,
    },
    candidate: patchedVersion,
    targetName: vulnerability.name,
  })) {
    plan.skipped.push(`${vulnerability.name}: candidate ${patchedVersion} failed install/audit validation.`);
    return plan;
  }

  const update = updateDependencySpec(vulnerability.name, currentSpec.raw, patchedVersion);
  if (!update.ok) {
    plan.skipped.push(`${vulnerability.name}: ${update.reason}.`);
    return plan;
  }
  const nextSpec = update.spec;
  addDependencyUpdate(plan, vulnerability.name, currentSpec.section, nextSpec);
  plan.fixed.push(`${vulnerability.name}: upgrade direct ${currentSpec.section} entry to ${nextSpec}.`);
  return plan;
}

function planNpmRecommendedParent({
  plan,
  vulnerability,
  fix,
  directDeps,
  lockfile,
  validateCandidate,
  context,
  options,
}) {
  if (!fix.name || fix.name === vulnerability.name || !directDeps.has(fix.name) || !fix.version) {
    return false;
  }

  const parentSpec = directDeps.get(fix.name);
  const parentCurrentVersion = findLockedVersion(fix.name, lockfile) || parentSpec.version;
  if (!parentCurrentVersion) {
    plan.skipped.push(`${vulnerability.name}: current parent version for ${fix.name} cannot be determined safely.`);
    return true;
  }

  if (compareVersions(fix.version, parentCurrentVersion) <= 0) {
    plan.skipped.push(`${vulnerability.name}: ignored npm recommendation ${fix.name}@${fix.version} because it is not newer than current ${parentCurrentVersion}; no alternate parent upgrade or override was available.`);
    return true;
  }

  if (!options.allowMajor && crossesMajor(parentCurrentVersion, fix.version)) {
    plan.skipped.push(`${vulnerability.name}: npm recommends parent upgrade ${fix.name} ${parentSpec.raw} -> ${fix.version}, but it crosses a major version.`);
    return true;
  }

  const deprecation = getDeprecationMessage(context, fix.name, fix.version);
  if (deprecation) {
    plan.skipped.push(`${vulnerability.name}: rejected deprecated parent upgrade ${fix.name}@${fix.version}: ${deprecation}`);
    return true;
  }

  if (!validateCandidate({
    dependencyUpdate: {
      name: fix.name,
      section: parentSpec.section,
      currentSpec: parentSpec.raw,
    },
    candidate: fix.version,
    targetName: vulnerability.name,
  })) {
    plan.skipped.push(`${vulnerability.name}: npm recommends parent upgrade ${fix.name} ${parentSpec.raw} -> ${fix.version}, but it failed install/audit validation.`);
    return true;
  }

  const update = updateDependencySpec(fix.name, parentSpec.raw, fix.version);
  if (!update.ok) {
    plan.skipped.push(`${vulnerability.name}: cannot update parent ${fix.name}; ${update.reason}.`);
    return true;
  }
  const nextSpec = update.spec;
  addDependencyUpdate(plan, fix.name, parentSpec.section, nextSpec);
  plan.fixed.push(`${vulnerability.name}: upgrade parent ${fix.name} from ${parentSpec.raw} to ${nextSpec}.`);
  return true;
}

function findParentUpgrade({ vulnerability, vulnerabilityMap, lockfile, directDeps, rootDependencySpecs, validateCandidate, options, report, context }) {
  const fix = normalizeFix(vulnerability.fixAvailable);
  const fixedVersion = !fix.name || fix.name === vulnerability.name ? getOwnPatchedVersion(context, vulnerability, fix) : null;
  const parentNames = [
    ...new Set([
      ...findDirectParents(vulnerability.name, lockfile, directDeps),
      ...findDirectEffectParents(vulnerability, vulnerabilityMap, directDeps),
      ...findDirectNodePathParents(vulnerability, directDeps),
    ]),
  ];

  for (const parentName of parentNames) {
    const direct = directDeps.get(parentName);
    const currentVersion = direct && (findLockedVersion(parentName, lockfile) || direct.version);
    if (!direct || !currentVersion) continue;

    const dependencyUpdate = {
      name: parentName,
      section: direct.section,
      currentSpec: direct.raw,
    };
    const candidate = fixedVersion
      ? findFirstParentVersionWithPatchedDependency({
          parentName,
          currentVersion,
          vulnerableName: vulnerability.name,
          fixedVersion,
          rootDependencySpecs,
          validateCandidate,
          dependencyUpdate,
          context,
          options,
          report,
        })
      : findFirstPackageVersionWithoutDependencies({
          packageName: parentName,
          currentVersion,
          dependencyNames: [vulnerability.name],
          targetName: vulnerability.name,
          rootDependencySpecs,
          validateCandidate,
          dependencyUpdate,
          context,
          options,
          report,
        });

    if (candidate) {
      const update = updateDependencySpec(parentName, direct.raw, candidate);
      if (!update.ok) {
        report.skipped.push(`${vulnerability.name}: cannot update parent ${parentName}; ${update.reason}.`);
        continue;
      }
      return {
        name: parentName,
        section: direct.section,
        currentSpec: direct.raw,
        nextSpec: update.spec,
      };
    }
  }

  return null;
}

function findDirectAggregateUpgrade({ vulnerability, vulnerabilityMap, currentVersion, rootDependencySpecs, validateCandidate, currentSpec, options, report, context }) {
  const carrierNames = findImmediateCarrierNames(vulnerability, vulnerabilityMap);
  if (!currentVersion || !carrierNames.length) return null;

  return findFirstPackageVersionWithoutDependencies({
    packageName: vulnerability.name,
    currentVersion,
    dependencyNames: carrierNames,
    targetName: vulnerability.name,
    rootDependencySpecs,
    validateCandidate,
    dependencyUpdate: {
      name: vulnerability.name,
      section: currentSpec.section,
      currentSpec: currentSpec.raw,
    },
    context,
    options,
    report,
  });
}

function getOwnPatchedVersion(context, vulnerability, fix) {
  if (fix.version && (!fix.name || fix.name === vulnerability.name)) return fix.version;

  const rangeFloor = getPatchedRangeFloor(vulnerability);
  return rangeFloor ? resolveMinimumVersion(context, vulnerability.name, rangeFloor) : null;
}

function getPatchedRangeFloor(vulnerability) {
  const advisories = (vulnerability.via || []).filter((item) => item && typeof item === 'object' && item.range);
  const upperBounds = [];
  let best = null;

  for (const advisory of advisories) {
    upperBounds.push(...getVulnerableUpperBounds(advisory.range));
  }

  for (const upperBound of upperBounds) {
    best = selectHigherUpperBound(best, upperBound);
  }

  return best ? `${best.inclusive ? '>' : '>='}${best.version}` : null;
}

function getVulnerableUpperBounds(range) {
  const matches = [...String(range).matchAll(/(<=|<)\s*(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/g)];
  return matches.map((match) => ({
      inclusive: match[1] === '<=',
      version: match[2],
    }));
}

function candidateSupportsCurrentNode(context, packageName, version, report) {
  const engines = npmViewJson(context, `${packageName}@${version}`, 'engines') || {};
  if (!engines.node || semver.satisfies(process.version, engines.node, { includePrerelease: true, loose: true })) {
    return true;
  }
  report.notes.push(`Skipping ${packageName}@${version}; requires Node ${engines.node}, current runtime is ${process.version}.`);
  return false;
}

function selectHigherUpperBound(current, candidate) {
  if (!candidate) return current;
  if (!current || compareVersions(candidate.version, current.version) > 0) {
    return candidate;
  }
  if (compareVersions(candidate.version, current.version) === 0 && candidate.inclusive && !current.inclusive) {
    return { ...current, inclusive: true };
  }
  return current;
}

function findDirectParents(vulnerableName, lockfile, directDeps) {
  const parents = new Set();

  for (const [path, metadata] of Object.entries(lockfile.packages || {})) {
    if (!metadata?.dependencies?.[vulnerableName]) continue;

    const packageName = metadata.name || packageNameFromNodeModulesPath(path);
    if (packageName && directDeps.has(packageName)) {
      parents.add(packageName);
    }
  }

  return [...parents];
}

function findDirectEffectParents(vulnerability, vulnerabilityMap, directDeps) {
  const parents = new Set();
  const visited = new Set();
  const queue = [...(vulnerability.effects || [])];

  while (queue.length) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);

    if (directDeps.has(name)) {
      parents.add(name);
      continue;
    }

    const parent = vulnerabilityMap.get(name);
    if (parent?.effects?.length) queue.push(...parent.effects);
  }

  return [...parents];
}

function findDirectNodePathParents(vulnerability, directDeps) {
  const parents = new Set();

  for (const nodePath of vulnerability.nodes || []) {
    const directParent = directParentFromNodePath(nodePath);
    if (directParent && directDeps.has(directParent)) parents.add(directParent);
  }

  return [...parents];
}

function directParentFromNodePath(nodePath) {
  const packages = packagesFromNodePath(nodePath);
  return packages.length < 2 ? null : packages[0];
}

function packagesFromNodePath(nodePath) {
  const parts = String(nodePath).split('/');
  const packages = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] !== 'node_modules') continue;

    const first = parts[index + 1];
    if (!first) continue;

    if (first.startsWith('@')) {
      const second = parts[index + 2];
      if (second) packages.push(`${first}/${second}`);
      continue;
    }

    packages.push(first);
  }

  return packages;
}

function hasRootVulnerableNode(vulnerability) {
  return (vulnerability.nodes || []).some((nodePath) => packageNameFromNodeModulesPath(nodePath) === vulnerability.name);
}

function hasCarrierVia(vulnerability) {
  return (vulnerability.via || []).some((item) => typeof item === 'string');
}

function findImmediateCarrierNames(vulnerability, vulnerabilityMap) {
  const names = new Set();

  for (const via of vulnerability.via || []) {
    if (typeof via !== 'string') continue;
    names.add(via);

    const child = vulnerabilityMap.get(via);
    for (const childVia of child?.via || []) {
      if (typeof childVia === 'string') names.add(childVia);
    }
  }

  return [...names];
}

function addDependencyUpdate(plan, name, section, spec) {
  plan.dependencyUpdates.set(name, { section, spec });
}
