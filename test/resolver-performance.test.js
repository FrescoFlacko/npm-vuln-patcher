import assert from 'node:assert/strict';
import test from 'node:test';
import { findFirstPackageVersionWithoutDependencies, getBoundedUpgradeCandidates } from '../src/candidates.js';
import { candidateHasAllowedPeers, resolveBestVersion, resolveMinimumVersion } from '../src/peer-policy.js';
import { resolveVulnerability } from '../src/resolver.js';

let contextId = 0;

test('rejects a peer-declaring candidate without traversing its dependency tree', () => {
  const { context, calls } = createRegistryContext({
    'parent@2.0.0|peerDependencies': { react: '^18.0.0' },
    'parent@2.0.0|peerDependenciesMeta': {},
    'parent@2.0.0|dependencies': { nested: '^1.0.0' },
  });
  const report = { notes: [] };

  const allowed = candidateHasAllowedPeers({
    packageName: 'parent',
    version: '2.0.0',
    rootDependencySpecs: new Map([['react', '^18.0.0']]),
    maxDepth: 3,
    skipPeerDependencyCandidates: true,
    report,
    context,
  });

  assert.equal(allowed, false);
  assert.deepEqual(calls, [
    'parent@2.0.0|peerDependencies',
    'parent@2.0.0|peerDependenciesMeta',
  ]);
  assert.match(report.notes[0], /candidate tree declares peerDependencies/);
});

test('checks the cheap dependency condition before peer-tree metadata', () => {
  const { context, calls } = createRegistryContext({
    'parent|versions': ['1.0.0', '1.1.0', '1.2.0'],
    'parent@1.1.0|dependencies': { vulnerable: '^1.0.0' },
    'parent@1.2.0|dependencies': {},
    'parent@1.2.0|peerDependencies': {},
    'parent@1.2.0|deprecated': null,
  });

  const candidate = findFirstPackageVersionWithoutDependencies({
    packageName: 'parent',
    currentVersion: '1.0.0',
    dependencyNames: ['vulnerable'],
    targetName: 'vulnerable',
    rootDependencySpecs: new Map(),
    validateCandidate: () => true,
    dependencyUpdate: {
      name: 'parent',
      section: 'dependencies',
      currentSpec: '^1.0.0',
    },
    context,
    options: {
      allowMajor: false,
      maxParentVersions: 5,
      peerCheckDepth: 1,
      skipPeerDependencyCandidates: true,
    },
    report: { notes: [] },
  });

  assert.equal(candidate, '1.2.0');
  assert.ok(!calls.includes('parent@1.1.0|peerDependencies'));
  assert.ok(calls.includes('parent@1.2.0|peerDependencies'));
});

test('rejects a deprecated override even when it clears an advisory', () => {
  const { context } = createRegistryContext({
    'lodash@>4.17.23|version': '4.18.0',
    'lodash@4.18.0|deprecated': 'Bad release. Please use lodash@4.17.21 instead.',
  });

  const plan = resolveVulnerability({
    vulnerability: {
      name: 'lodash',
      severity: 'high',
      isDirect: false,
      via: [{ range: '<=4.17.23' }],
      effects: [],
      nodes: ['node_modules/lodash'],
      fixAvailable: true,
    },
    vulnerabilityMap: new Map(),
    lockfile: { packages: {} },
    directDeps: new Map(),
    rootDependencySpecs: new Map(),
    validateCandidate: () => true,
    context,
    existingOverrides: {},
    options: {
      allowMajor: false,
      fallbackOverrides: true,
      preferParentUpgrade: false,
    },
    report: { notes: [], skipped: [] },
  });

  assert.equal(plan.overrideUpdates.size, 0);
  assert.match(plan.skipped[0], /rejected deprecated override 4\.18\.0/);
});

test('builds a small representative candidate shortlist', () => {
  const { context } = createRegistryContext({
    'parent|versions': ['1.0.1', '1.0.2', '1.9.0', '2.0.0', '3.0.0-beta.1'],
  });

  const candidates = getBoundedUpgradeCandidates({
    context,
    packageName: 'parent',
    minimumVersion: '1.0.1',
    currentVersion: '1.0.0',
    options: { maxCandidatesPerPackage: 3 },
  });

  assert.deepEqual(candidates, ['1.9.0', '1.0.1']);
});

test('sorts npm range results semantically instead of trusting publication order', () => {
  const { context } = createRegistryContext({
    'undici@>=7.28.0|version': ['8.0.0', '8.5.0', '7.28.0', '8.9.0', '7.29.0'],
  });

  assert.equal(resolveMinimumVersion(context, 'undici', '>=7.28.0'), '7.28.0');
  assert.equal(resolveBestVersion(context, 'undici', '>=7.28.0'), '8.9.0');
});

test('treats an empty registry range as no candidate instead of an operational failure', () => {
  const context = {
    cwd: `/tmp/npm-vuln-patcher-empty-range-${contextId++}`,
    run() {
      return {
        error: null,
        signal: null,
        status: 1,
        stdout: '',
        stderr: 'npm error code E404\nnpm error 404 No match found for version >2.88.2',
      };
    },
  };

  assert.equal(resolveMinimumVersion(context, 'request', '>2.88.2'), null);
  assert.equal(resolveBestVersion(context, 'request', '>2.88.2'), null);
});

test('uses the semantic safe floor and rejects incompatible candidate engines', () => {
  const { context, calls } = createRegistryContext({
    'undici@>=7.28.0|version': '7.28.0',
    'undici|versions': ['7.27.2', '7.28.0', '7.29.0', '8.5.0'],
    'undici@7.29.0|deprecated': null,
    'undici@7.29.0|engines': { node: '>=99' },
    'undici@7.28.0|deprecated': null,
    'undici@7.28.0|engines': { node: '>=20' },
  });
  const report = { notes: [], skipped: [] };

  const plan = resolveVulnerability({
    vulnerability: {
      name: 'undici',
      severity: 'high',
      isDirect: false,
      via: [
        { range: '>=7.0.0 <7.28.0' },
      ],
      effects: [],
      range: '7.0.0 - 7.27.2',
      nodes: ['node_modules/undici'],
      fixAvailable: true,
    },
    vulnerabilityMap: new Map(),
    lockfile: {
      packages: {
        'node_modules/undici': { version: '7.27.2' },
      },
    },
    directDeps: new Map(),
    rootDependencySpecs: new Map(),
    validateCandidate: () => true,
    context,
    existingOverrides: {},
    options: {
      allowMajor: false,
      fallbackOverrides: true,
      preferParentUpgrade: false,
      maxCandidatesPerPackage: 3,
    },
    report,
  });

  assert.equal(plan.overrideUpdates.get('undici'), '7.28.0');
  assert.ok(!calls.some((call) => call.includes('>=8.0.0')));
  assert.match(report.notes.join('\n'), /requires Node >=99/);
});

function createRegistryContext(values) {
  const calls = [];
  const context = {
    cwd: `/tmp/npm-vuln-patcher-registry-test-${contextId++}`,
    run(command, args) {
      assert.equal(command, 'npm');
      assert.equal(args[0], 'view');
      const key = `${args[1]}|${args[2]}`;
      calls.push(key);
      return {
        error: null,
        signal: null,
        status: 0,
        stdout: values[key] === undefined ? '' : JSON.stringify(values[key]),
        stderr: '',
      };
    },
  };
  return { context, calls };
}
