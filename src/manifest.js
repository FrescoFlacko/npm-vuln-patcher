import { readFileSync, writeFileSync } from 'node:fs';
import { versionFromDependencySpec } from './package-spec.js';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function getDirectDependencies(packageJson) {
  const directDeps = new Map();

  for (const section of dependencySections()) {
    for (const [name, raw] of Object.entries(packageJson[section] || {})) {
      directDeps.set(name, {
        section,
        raw,
        version: versionFromDependencySpec(name, raw),
      });
    }
  }

  return directDeps;
}

export function getRootDependencySpecs(packageJson) {
  const specs = new Map();

  for (const section of dependencySections()) {
    for (const [name, raw] of Object.entries(packageJson[section] || {})) {
      specs.set(name, raw);
    }
  }

  return specs;
}

export function mergeManifestChanges(packageJson, planned) {
  const nextPackageJson = structuredClone(packageJson);
  let hasChanges = false;

  for (const plan of planned) {
    for (const [name, update] of plan.dependencyUpdates) {
      if (!nextPackageJson[update.section]) {
        nextPackageJson[update.section] = {};
      }

      if (nextPackageJson[update.section][name] !== update.spec) {
        nextPackageJson[update.section][name] = update.spec;
        hasChanges = true;
      }
    }

    for (const [name, version] of plan.overrideUpdates) {
      if (!nextPackageJson.overrides) {
        nextPackageJson.overrides = {};
      }

      if (nextPackageJson.overrides[name] !== version) {
        nextPackageJson.overrides[name] = version;
        hasChanges = true;
      }
    }
  }

  return { hasChanges, nextPackageJson };
}

export function findLockedVersion(packageName, lockfile) {
  return lockfile.packages?.[`node_modules/${packageName}`]?.version || null;
}

export function packageNameFromNodeModulesPath(path) {
  const marker = 'node_modules/';
  const index = path.lastIndexOf(marker);

  if (index === -1) return null;

  const name = path.slice(index + marker.length);
  const parts = name.split('/');

  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0] || null;
}

function dependencySections() {
  return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
}
