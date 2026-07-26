import assert from 'node:assert/strict';
import test from 'node:test';
import { planDirectRootCohorts } from '../src/cohorts.js';

let contextId = 0;

test('builds a bounded root cohort without traversing ordinary dependencies', () => {
  const { context, calls } = createRegistryContext({
    '@framework/core|versions': ['1.0.0', '1.1.0'],
    '@framework/core@1.1.0|deprecated': null,
    '@framework/core@1.1.0|peerDependencies': { helper: '^2.1.0' },
    '@framework/core@1.1.0|peerDependenciesMeta': {},
    '@framework/router|versions': ['1.0.0', '1.1.0'],
    '@framework/router@1.1.0|deprecated': null,
    '@framework/router@1.1.0|peerDependencies': { '@framework/core': '^1.1.0' },
    '@framework/router@1.1.0|peerDependenciesMeta': {},
    'helper|versions': ['2.0.0', '2.1.0'],
    'helper@2.1.0|deprecated': null,
    'helper@2.1.0|peerDependencies': {},
  });
  const directDeps = new Map([
    ['@framework/core', dependency('dependencies', '^1.0.0', '1.0.0')],
    ['@framework/router', dependency('dependencies', '^1.0.0', '1.0.0')],
    ['helper', dependency('devDependencies', '^2.0.0', '2.0.0')],
  ]);
  const lockfile = {
    packages: {
      'node_modules/@framework/core': { version: '1.0.0' },
      'node_modules/@framework/router': { version: '1.0.0' },
      'node_modules/helper': { version: '2.0.0' },
    },
  };
  const report = { notes: [] };

  const plans = planDirectRootCohorts({
    vulnerabilities: [
      finding('@framework/core'),
      finding('@framework/router'),
    ],
    directDeps,
    lockfile,
    context,
    options: {
      allowMajor: false,
      maxPeerClosureRounds: 3,
      maxPackagesPerGroup: 10,
      maxCandidatesPerPackage: 3,
    },
    report,
  });

  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].targetNames.sort(), ['@framework/core', '@framework/router']);
  assert.equal(plans[0].dependencyUpdates.get('@framework/core').spec, '^1.1.0');
  assert.equal(plans[0].dependencyUpdates.get('@framework/router').spec, '^1.1.0');
  assert.equal(plans[0].dependencyUpdates.get('helper').spec, '^2.1.0');
  assert.equal(plans[0].allowLockRefresh, true);
  assert.ok(calls.every((call) => !call.endsWith('|dependencies')));
});

test('allows an upgraded candidate only when deprecation already exists', () => {
  const { context } = createRegistryContext({
    '@old/a|versions': ['1.0.0', '1.1.0'],
    '@old/a@1.1.0|deprecated': 'Package is retired.',
    '@old/a@1.0.0|deprecated': 'Package is retired.',
    '@old/a@1.1.0|peerDependencies': {},
    '@old/b|versions': ['1.0.0', '1.1.0'],
    '@old/b@1.1.0|deprecated': 'Package is retired.',
    '@old/b@1.0.0|deprecated': null,
  });
  const directDeps = new Map([
    ['@old/a', dependency('dependencies', '^1.0.0', '1.0.0')],
    ['@old/b', dependency('dependencies', '^1.0.0', '1.0.0')],
  ]);
  const lockfile = {
    packages: {
      'node_modules/@old/a': { version: '1.0.0' },
      'node_modules/@old/b': { version: '1.0.0' },
    },
  };
  const report = { notes: [] };

  const plans = planDirectRootCohorts({
    vulnerabilities: [finding('@old/a'), finding('@old/b')],
    directDeps,
    lockfile,
    context,
    options: {
      allowMajor: false,
      maxPeerClosureRounds: 2,
      maxPackagesPerGroup: 10,
      maxCandidatesPerPackage: 2,
    },
    report,
  });

  assert.deepEqual(plans, []);
  assert.match(report.notes.join('\n'), /Allowing security candidate @old\/a@1\.1\.0/);
  assert.match(report.notes.join('\n'), /Skipping newly deprecated root candidate @old\/b@1\.1\.0/);
});

function dependency(section, raw, version) {
  return { section, raw, version };
}

function finding(name) {
  return {
    name,
    severity: 'high',
    isDirect: true,
  };
}

function createRegistryContext(values) {
  const calls = [];
  const context = {
    cwd: `/tmp/npm-vuln-patcher-cohort-test-${contextId++}`,
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
