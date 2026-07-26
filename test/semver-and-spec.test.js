import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareVersions,
  isPrereleaseVersion,
  rangesMayOverlap,
} from '../src/semver.js';
import { updateDependencySpec, versionFromDependencySpec } from '../src/package-spec.js';

test('prereleases compare lower than their releases', () => {
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
  assert.equal(isPrereleaseVersion('1.0.0-beta.1'), true);
});

test('range intersections follow semver including zero-major caret rules', () => {
  assert.equal(rangesMayOverlap('^18.2.0', '>=18.3.0 <19.0.0'), true);
  assert.equal(rangesMayOverlap('^0.9.0', '^0.2.0'), false);
  assert.equal(rangesMayOverlap('1.2.0 - 1.4.0', '^1.3.0'), true);
  assert.equal(rangesMayOverlap('*', '>=5'), true);
});

test('safe dependency styles are preserved', () => {
  assert.deepEqual(updateDependencySpec('demo', '^1.2.3', '1.4.0'), { ok: true, spec: '^1.4.0' });
  assert.deepEqual(updateDependencySpec('demo', '~1.2.3', '1.3.0'), { ok: true, spec: '~1.3.0' });
  assert.deepEqual(updateDependencySpec('demo', '1.2.3', '1.3.0'), { ok: true, spec: '1.3.0' });
});

test('workspace, alias, tag, URL, git, file, and ambiguous ranges fail closed', () => {
  const specs = [
    'workspace:^1.2.3',
    'npm:other@^1.2.3',
    'latest',
    'https://example.test/demo.tgz',
    'git+https://example.test/demo.git',
    'file:../demo',
    '>=1.2.3 <2',
  ];
  for (const spec of specs) {
    assert.equal(updateDependencySpec('demo', spec, '2.0.0').ok, false, spec);
  }
});

test('versions are read only from supported dependency specs', () => {
  assert.equal(versionFromDependencySpec('demo', '^1.2.3'), '1.2.3');
  assert.equal(versionFromDependencySpec('demo', 'workspace:^1.2.3'), null);
});
