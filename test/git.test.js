import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeGitState } from '../src/git.js';
import { validateOptions } from '../src/config.js';

test('non-git targets require explicit opt-in', () => {
  const context = sequenceContext([{ status: 128, stdout: '', stderr: 'not a git repository' }]);
  assert.throws(() => assertSafeGitState(context, validateOptions({ apply: true, allowNoTest: true })), {
    code: 'NON_GIT_TARGET',
  });

  assert.doesNotThrow(() => assertSafeGitState(
    sequenceContext([{ status: 128, stdout: '', stderr: 'not a git repository' }]),
    validateOptions({ apply: true, allowNonGit: true, allowNoTest: true }),
  ));
});

test('dirty worktrees require explicit opt-in', () => {
  const dirty = [
    { status: 0, stdout: 'true\n', stderr: '' },
    { status: 0, stdout: ' M package.json\n', stderr: '' },
  ];
  assert.throws(() => assertSafeGitState(sequenceContext(dirty), validateOptions({ apply: true, allowNoTest: true })), {
    code: 'DIRTY_WORKTREE',
  });

  assert.doesNotThrow(() => assertSafeGitState(
    sequenceContext(dirty),
    validateOptions({ apply: true, allowDirty: true, allowNoTest: true }),
  ));
});

test('git inspection failures fail closed', () => {
  const failure = new Error('git executable unavailable');
  assert.throws(
    () => assertSafeGitState(
      sequenceContext([{ status: null, stdout: '', stderr: '', error: failure }]),
      validateOptions({ apply: true, allowNoTest: true }),
    ),
    { code: 'GIT_INSPECTION_FAILED' },
  );
});

function sequenceContext(results) {
  let index = 0;
  return {
    run() {
      return { signal: null, error: null, ...results[index++] };
    },
  };
}
