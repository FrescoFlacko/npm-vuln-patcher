import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnresolvedGuidance, REASON_CODES } from '../src/unresolved.js';

test('reports a blocked major upgrade with a concrete next action', () => {
  const [entry] = buildUnresolvedGuidance({
    vulnerabilities: [vulnerability('vitest', {
      currentVersion: '1.6.1',
      fixAvailable: {
        name: 'vitest',
        version: '4.1.10',
        isSemVerMajor: true,
      },
    })],
    report: {
      skipped: ['vitest: direct upgrade 1.6.1 -> 4.1.10 crosses a major version.'],
      notes: [],
    },
    lockfile: lockfile({ vitest: '1.6.1' }),
    options: { allowMajor: false },
  });

  assert.equal(entry.package, 'vitest');
  assert.equal(entry.currentVersion, '1.6.1');
  assert.equal(entry.reasonCode, REASON_CODES.SEMVER_MAJOR_BLOCKED);
  assert.deepEqual(entry.attemptedUpdates, [{ package: 'vitest', version: '4.1.10' }]);
  assert.deepEqual(entry.suggestedFlags, ['--allow-major']);
  assert.match(entry.suggestedAction, /complete --test command/);
});

test('correlates audit regressions and attempted cohort versions by package', () => {
  const [entry] = buildUnresolvedGuidance({
    vulnerabilities: [vulnerability('@react-router/dev', {
      currentVersion: '7.14.1',
      fixAvailable: true,
    })],
    report: {
      skipped: [
        '@react-router/dev: coordinated root upgrade ^7.14.1 -> ^7.18.1.: skipped because the resulting audit did not improve without regressions.',
      ],
      notes: [
        '@eslint/config-array: introduced as a new high vulnerability',
        '@react-router/dev: vulnerable range expanded from "<=7.14.1" to "7.12.0-pre.0 - 8.2.0"',
      ],
    },
    lockfile: lockfile({ '@react-router/dev': '7.14.1' }),
    options: { allowMajor: false },
  });

  assert.equal(entry.reasonCode, REASON_CODES.AUDIT_REGRESSION);
  assert.deepEqual(entry.attemptedUpdates, [{ package: '@react-router/dev', version: '7.18.1' }]);
  assert.match(entry.blockingEvidence.join('\n'), /vulnerable range expanded/);
  assert.doesNotMatch(entry.blockingEvidence.join('\n'), /@eslint\/config-array/);
  assert.deepEqual(entry.suggestedFlags, []);
});

test('suggests opt-in peer candidate inspection only when peer metadata blocked candidates', () => {
  const [entry] = buildUnresolvedGuidance({
    vulnerabilities: [vulnerability('@react-router/node', {
      currentVersion: '7.14.1',
      fixAvailable: true,
    })],
    report: {
      skipped: [
        '@react-router/node: direct package is vulnerable through dependencies, but npm did not provide a concrete safe version and no safe aggregate upgrade was found.',
      ],
      notes: [
        'Skipping @react-router/node@7.15.0; candidate tree declares peerDependencies: @react-router/node@7.15.0 declares react-router@7.15.0',
      ],
    },
    lockfile: lockfile({ '@react-router/node': '7.14.1' }),
    options: { allowMajor: false },
  });

  assert.equal(entry.reasonCode, REASON_CODES.PEER_DEPENDENCY_CONFLICT);
  assert.deepEqual(entry.suggestedFlags, ['--allow-peer-dependency-candidates']);
  assert.deepEqual(entry.attemptedUpdates, [{ package: '@react-router/node', version: '7.15.0' }]);
});

test('does not confuse package names that are prefixes of other packages', () => {
  const [entry] = buildUnresolvedGuidance({
    vulnerabilities: [vulnerability('vite', {
      currentVersion: '5.4.20',
      fixAvailable: true,
    })],
    report: {
      skipped: [],
      notes: ['vitest: candidate 4.1.10 failed install/audit validation.'],
    },
    lockfile: lockfile({ vite: '5.4.20' }),
    options: { allowMajor: false },
  });

  assert.equal(entry.reasonCode, REASON_CODES.UNRESOLVED);
  assert.deepEqual(entry.blockingEvidence, []);
});

function vulnerability(name, { fixAvailable, currentVersion }) {
  return {
    name,
    severity: 'high',
    range: `<${currentVersion}`,
    fixAvailable,
  };
}

function lockfile(packages) {
  return {
    packages: Object.fromEntries(
      Object.entries(packages).map(([name, version]) => [`node_modules/${name}`, { version }]),
    ),
  };
}
