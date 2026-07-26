import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDirectDependencies,
  packageNameFromNodeModulesPath,
} from '../src/manifest.js';

test('dependency sections retain their owners and supported versions', () => {
  const dependencies = getDirectDependencies({
    dependencies: { production: '^1.2.3' },
    devDependencies: { development: '~2.0.0' },
    optionalDependencies: { optional: '3.0.0' },
    peerDependencies: { peer: '^4.0.0' },
  });

  assert.deepEqual(dependencies.get('production'), {
    section: 'dependencies',
    raw: '^1.2.3',
    version: '1.2.3',
  });
  assert.equal(dependencies.get('development').section, 'devDependencies');
  assert.equal(dependencies.get('optional').section, 'optionalDependencies');
  assert.equal(dependencies.get('peer').section, 'peerDependencies');
});

test('scoped and nested node_modules paths resolve to package names', () => {
  assert.equal(packageNameFromNodeModulesPath('node_modules/@scope/demo'), '@scope/demo');
  assert.equal(
    packageNameFromNodeModulesPath('node_modules/parent/node_modules/@scope/demo'),
    '@scope/demo',
  );
  assert.equal(packageNameFromNodeModulesPath('src/demo.js'), null);
});
