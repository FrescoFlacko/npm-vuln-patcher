import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createExecutionContext } from '../src/execution-context.js';
import { npmViewJson, runNpmAudit } from '../src/npm.js';
import { validateOptions } from '../src/config.js';

test('every command receives the resolved target cwd', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'patcher-context-'));
  let received;
  try {
    const context = createExecutionContext({
      cwd,
      commandRunner(input) {
        received = input;
        return { status: 0, stdout: '', stderr: '', signal: null };
      },
    });
    context.run('npm', ['--version']);
    assert.equal(received.cwd, context.cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('audit command failures and error JSON fail closed', () => {
  const options = validateOptions();
  assert.throws(() => runNpmAudit(fakeContext({ status: 1, stdout: '{bad json' }), options), /malformed JSON/);
  assert.throws(
    () => runNpmAudit(fakeContext({
      status: 1,
      stdout: JSON.stringify({ error: { summary: 'registry unavailable' } }),
    }), options),
    /audit error/,
  );
  assert.throws(() => runNpmAudit(fakeContext({ status: 1, stdout: '' }), options), /no JSON output/);
});

test('registry command failures fail closed', () => {
  assert.throws(
    () => npmViewJson(fakeContext({ status: 1, stdout: '', stderr: 'registry unavailable' }), 'demo', 'versions'),
    /npm view demo versions exited with status 1/,
  );
});

test('registry reads retry one transient network failure', () => {
  const codes = ['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN'];

  for (const [index, code] of codes.entries()) {
    for (const reportStyle of ['error', 'stderr']) {
      let calls = 0;
      const context = {
        cwd: `/tmp/npm-vuln-patcher-registry-retry-${index}-${reportStyle}`,
        run() {
          calls += 1;
          if (calls === 1) {
            return {
              status: reportStyle === 'error' ? null : 1,
              stdout: '',
              stderr: reportStyle === 'stderr' ? `npm error code ${code}` : '',
              signal: null,
              error: reportStyle === 'error' ? Object.assign(new Error('network failure'), { code }) : null,
            };
          }
          return {
            status: 0,
            stdout: '["1.0.0"]',
            stderr: '',
            signal: null,
            error: null,
          };
        },
      };

      assert.deepEqual(npmViewJson(context, `retry-demo-${index}-${reportStyle}`, 'versions'), ['1.0.0']);
      assert.equal(calls, 2);
    }
  }
});

function fakeContext(result) {
  return {
    run() {
      return { stderr: '', signal: null, error: null, ...result };
    },
  };
}
