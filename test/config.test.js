import assert from 'node:assert/strict';
import test from 'node:test';
import { EXIT_CODE } from '../src/errors.js';
import { parseArgs, validateOptions } from '../src/config.js';

test('dry run is the default and apply must be explicit', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.maxParentVersions, 5);
  assert.equal(defaults.peerCheckDepth, 1);
  assert.equal(defaults.maxPeerClosureRounds, 3);
  assert.equal(defaults.maxPackagesPerGroup, 24);
  assert.equal(defaults.maxCandidatesPerPackage, 3);
  assert.equal(defaults.maxResolverAttemptsPerGroup, 6);
  assert.equal(defaults.maxFixpointPasses, 3);
  assert.equal(defaults.refreshLockfile, true);
  assert.equal(defaults.allowNoTest, false);
  assert.equal(parseArgs(['--apply', '--test', 'npm test']).apply, true);
  assert.equal(parseArgs(['--apply', '--allow-no-test']).allowNoTest, true);
  assert.equal(parseArgs(['--no-lock-refresh']).refreshLockfile, false);
});

test('conflicting and duplicate modes are rejected', () => {
  assert.throws(() => parseArgs(['--apply', '--dry-run']), { exitCode: EXIT_CODE.INVALID_INPUT });
  assert.throws(() => parseArgs(['--apply', '--apply', '--allow-no-test']), { exitCode: EXIT_CODE.INVALID_INPUT });
  assert.throws(
    () => parseArgs(['--apply', '--test', 'npm test', '--allow-no-test']),
    { exitCode: EXIT_CODE.INVALID_INPUT },
  );
  assert.throws(() => parseArgs(['--allow-no-test']), { exitCode: EXIT_CODE.INVALID_INPUT });
});

test('apply requires application verification or an explicit dependency-only acknowledgement', () => {
  assert.throws(() => parseArgs(['--apply']), {
    code: 'INVALID_INPUT',
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
  assert.throws(() => validateOptions({ apply: true, testCommand: '   ' }), {
    code: 'INVALID_INPUT',
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
  assert.equal(validateOptions({ apply: true, allowNoTest: true }).allowNoTest, true);
  assert.equal(validateOptions({ apply: true, testCommand: 'npm test' }).testCommand, 'npm test');
  assert.equal(parseArgs(['--apply', '--help']).help, true);
});

test('numeric options are bounded integers', () => {
  for (const value of ['NaN', '0', '-1', '1.5', '501']) {
    assert.throws(() => parseArgs(['--max-parent-versions', value]), { exitCode: EXIT_CODE.INVALID_INPUT });
  }
  for (const value of ['NaN', '-1', '1.5', '11']) {
    assert.throws(() => parseArgs(['--peer-check-depth', value]), { exitCode: EXIT_CODE.INVALID_INPUT });
  }
  const boundedOptions = [
    ['--max-peer-closure-rounds', '11'],
    ['--max-packages-per-group', '1'],
    ['--max-candidates-per-package', '0'],
    ['--max-resolver-attempts-per-group', '21'],
    ['--max-fixpoint-passes', '0'],
  ];
  for (const args of boundedOptions) {
    assert.throws(() => parseArgs(args), { exitCode: EXIT_CODE.INVALID_INPUT });
  }
});

test('programmatic options are validated at the boundary', () => {
  assert.throws(() => validateOptions({ unexpected: true }), { exitCode: EXIT_CODE.INVALID_INPUT });
  assert.throws(() => validateOptions({ apply: 'yes' }), { exitCode: EXIT_CODE.INVALID_INPUT });
  assert.equal(validateOptions({ severity: 'high' }).severity, 'high');
});
