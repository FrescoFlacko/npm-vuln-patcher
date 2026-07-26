import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createExecutionContext } from '../src/execution-context.js';
import { recoverInterruptedCommit, runInStagedWorkspace } from '../src/transaction.js';

test('a staged failure leaves target files byte-for-byte unchanged', async () => {
  await withProject(async ({ cwd, packageBefore, lockBefore }) => {
    const context = createExecutionContext({ cwd });
    await assert.rejects(
      runInStagedWorkspace(context, async ({ stagedContext }) => {
        writeFileSync(join(stagedContext.cwd, 'package.json'), '{"changed":true}\n');
        throw new Error('injected failure');
      }),
      /injected failure/,
    );
    assert.deepEqual(readFileSync(join(cwd, 'package.json')), packageBefore);
    assert.deepEqual(readFileSync(join(cwd, 'package-lock.json')), lockBefore);
  });
});

test('validated staged files are committed', async () => {
  await withProject(async ({ cwd }) => {
    const context = createExecutionContext({ cwd });
    await runInStagedWorkspace(context, async ({ stagedContext }) => {
      writeFileSync(join(stagedContext.cwd, 'package.json'), '{"name":"updated"}\n');
      writeFileSync(join(stagedContext.cwd, 'package-lock.json'), '{"lockfileVersion":3}\n');
    });
    assert.equal(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).name, 'updated');
  });
});

test('concurrent target changes are detected and never overwritten', async () => {
  await withProject(async ({ cwd }) => {
    const context = createExecutionContext({ cwd });
    await assert.rejects(
      runInStagedWorkspace(context, async ({ stagedContext }) => {
        writeFileSync(join(stagedContext.cwd, 'package.json'), '{"name":"staged"}\n');
        writeFileSync(join(cwd, 'package.json'), '{"name":"concurrent"}\n');
      }),
      /changed during validation/,
    );
    assert.equal(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).name, 'concurrent');
  });
});

test('an interrupted two-file commit is recovered from its journal', async () => {
  await withProject(async ({ cwd, packageBefore, lockBefore }) => {
    writeFileSync(join(cwd, '.package.json.recovery.bak'), packageBefore);
    writeFileSync(join(cwd, '.package-lock.json.recovery.bak'), lockBefore);
    writeFileSync(join(cwd, '.npm-vuln-patcher-journal.json'), JSON.stringify({
      version: 1,
      packageBackup: '.package.json.recovery.bak',
      lockBackup: '.package-lock.json.recovery.bak',
    }));
    writeFileSync(join(cwd, 'package.json'), '{"name":"partial"}\n');
    writeFileSync(join(cwd, 'package-lock.json'), '{"partial":true}\n');

    assert.equal(recoverInterruptedCommit(cwd), true);
    assert.deepEqual(readFileSync(join(cwd, 'package.json')), packageBefore);
    assert.deepEqual(readFileSync(join(cwd, 'package-lock.json')), lockBefore);
  });
});

async function withProject(callback) {
  const cwd = mkdtempSync(join(tmpdir(), 'patcher-transaction-'));
  const packageJson = '{"name":"fixture","version":"1.0.0"}\n';
  const lockfile = '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}\n';
  writeFileSync(join(cwd, 'package.json'), packageJson);
  writeFileSync(join(cwd, 'package-lock.json'), lockfile);
  try {
    await callback({
      cwd,
      packageBefore: Buffer.from(packageJson),
      lockBefore: Buffer.from(lockfile),
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
