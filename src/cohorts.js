import semver from 'semver';
import { findLockedVersion } from './manifest.js';
import { getDeprecationMessage, npmViewJson } from './npm.js';
import { updateDependencySpec } from './package-spec.js';

export function planDirectRootCohorts({
  vulnerabilities,
  directDeps,
  lockfile,
  context,
  options,
  report,
}) {
  const directFindings = vulnerabilities.filter((item) => item.isDirect && directDeps.has(item.name));
  if (directFindings.length < 2) return [];

  const selected = new Map();
  const targets = new Set(directFindings.map((item) => item.name));
  const union = createUnionFind();

  for (const finding of directFindings) {
    const candidate = selectRootCandidate({
      packageName: finding.name,
      directDeps,
      lockfile,
      context,
      options,
      report,
    });
    if (!candidate) continue;
    selected.set(finding.name, candidate);
    union.add(finding.name);
  }

  const byScope = new Map();
  for (const packageName of selected.keys()) {
    const scope = packageScope(packageName);
    if (!scope) continue;
    const first = byScope.get(scope);
    if (first) union.join(first, packageName);
    else byScope.set(scope, packageName);
  }

  for (let round = 0; round < options.maxPeerClosureRounds; round += 1) {
    let added = false;
    for (const [packageName, candidate] of [...selected]) {
      const peerDependencies = npmViewJson(context, `${packageName}@${candidate.version}`, 'peerDependencies') || {};
      const peerMeta = Object.keys(peerDependencies).length
        ? npmViewJson(context, `${packageName}@${candidate.version}`, 'peerDependenciesMeta') || {}
        : {};

      for (const [peerName, peerRange] of Object.entries(peerDependencies)) {
        if (!directDeps.has(peerName)) continue;
        const peerVersion = selected.get(peerName)?.version || findLockedVersion(peerName, lockfile) || directDeps.get(peerName)?.version;
        if (peerVersion && semver.satisfies(peerVersion, peerRange, { includePrerelease: true, loose: true })) {
          if (selected.has(peerName)) union.join(packageName, peerName);
          continue;
        }
        if (peerMeta?.[peerName]?.optional && !directDeps.has(peerName)) continue;

        const peerCandidate = selectRootCandidate({
          packageName: peerName,
          directDeps,
          lockfile,
          context,
          options,
          report,
          requiredRange: peerRange,
        });
        if (!peerCandidate) continue;
        if (!selected.has(peerName)) {
          selected.set(peerName, peerCandidate);
          union.add(peerName);
          added = true;
        }
        union.join(packageName, peerName);
      }
    }
    if (!added) break;
  }

  const groups = new Map();
  for (const [packageName, candidate] of selected) {
    const root = union.find(packageName);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push([packageName, candidate]);
  }

  const plans = [];
  for (const entries of groups.values()) {
    const targetEntries = entries.filter(([name]) => targets.has(name));
    if (targetEntries.length < 2) continue;
    if (entries.length > options.maxPackagesPerGroup) {
      report.notes.push(`Skipped root peer cohort of ${entries.length} packages because it exceeds maxPackagesPerGroup=${options.maxPackagesPerGroup}.`);
      continue;
    }

    const plan = createCohortPlan(targetEntries.map(([name]) => name));
    for (const [name, candidate] of entries) {
      plan.dependencyUpdates.set(name, {
        section: candidate.section,
        spec: candidate.spec,
      });
      plan.fixed.push(`${name}: coordinated root upgrade ${candidate.currentSpec} -> ${candidate.spec}.`);
    }
    plans.push(plan);
  }

  return plans;
}

function selectRootCandidate({
  packageName,
  directDeps,
  lockfile,
  context,
  options,
  report,
  requiredRange,
}) {
  const direct = directDeps.get(packageName);
  const currentVersion = findLockedVersion(packageName, lockfile) || direct?.version;
  if (!direct || !currentVersion || direct.section === 'peerDependencies') return null;

  const versions = npmViewJson(context, packageName, 'versions');
  if (!Array.isArray(versions)) return null;
  const currentMajor = semver.major(currentVersion);
  const candidates = versions
    .filter((version) => semver.valid(version) && !semver.prerelease(version))
    .filter((version) => semver.gt(version, currentVersion))
    .filter((version) => options.allowMajor || semver.major(version) === currentMajor)
    .filter((version) => !requiredRange || semver.satisfies(version, requiredRange, { includePrerelease: true, loose: true }))
    .sort(semver.rcompare);

  for (const version of candidates.slice(0, options.maxCandidatesPerPackage)) {
    const update = updateDependencySpec(packageName, direct.raw, version);
    if (!update.ok) continue;

    const engines = npmViewJson(context, `${packageName}@${version}`, 'engines') || {};
    if (engines.node && !semver.satisfies(process.version, engines.node, { includePrerelease: true, loose: true })) {
      report.notes.push(`Skipping ${packageName}@${version}; requires Node ${engines.node}, current runtime is ${process.version}.`);
      continue;
    }

    const candidateDeprecation = getDeprecationMessage(context, packageName, version);
    if (candidateDeprecation) {
      const currentDeprecation = getDeprecationMessage(context, packageName, currentVersion);
      if (!currentDeprecation) {
        report.notes.push(`Skipping newly deprecated root candidate ${packageName}@${version}: ${candidateDeprecation}`);
        continue;
      }
      report.notes.push(`Allowing security candidate ${packageName}@${version} because the installed ${packageName}@${currentVersion} is already deprecated.`);
    }

    return {
      version,
      section: direct.section,
      currentSpec: direct.raw,
      spec: update.spec,
    };
  }
  return null;
}

function createCohortPlan(targetNames) {
  return {
    kind: 'root-peer-cohort',
    targetNames,
    allowLockRefresh: true,
    fixed: [],
    overrides: [],
    skipped: [],
    dependencyUpdates: new Map(),
    overrideUpdates: new Map(),
    overrideCandidateVersions: new Map(),
  };
}

function packageScope(packageName) {
  return packageName.startsWith('@') ? packageName.split('/')[0] : null;
}

function createUnionFind() {
  const parent = new Map();
  return {
    add(name) {
      if (!parent.has(name)) parent.set(name, name);
    },
    find(name) {
      const value = parent.get(name);
      if (value === name) return name;
      const root = this.find(value);
      parent.set(name, root);
      return root;
    },
    join(left, right) {
      this.add(left);
      this.add(right);
      const leftRoot = this.find(left);
      const rightRoot = this.find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    },
  };
}
