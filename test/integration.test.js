import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { EXIT_CODE } from '../src/errors.js';
import { runNpmVulnPatcher } from '../src/index.js';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('a clean target is not contaminated by a vulnerable launcher directory', { timeout: 30_000 }, () => {
  const launcher = createFixture({ minimist: '0.0.8' });
  const target = createFixture();
  try {
    const sourceUrl = pathToFileURL(join(PACKAGE_ROOT, 'src/index.js')).href;
    const code = `
      import { runNpmVulnPatcher } from ${JSON.stringify(sourceUrl)};
      const report = await runNpmVulnPatcher({
        cwd: ${JSON.stringify(target)},
        options: { format: 'json', skipAuditFix: true }
      });
      process.exitCode = report.exitCode;
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: launcher,
      encoding: 'utf8',
      timeout: 25_000,
    });

    assert.equal(result.status, EXIT_CODE.SUCCESS, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.remaining, []);
    assert.deepEqual(report.unresolved, []);
    assert.equal(report.previewPackageJson, null);
    assert.equal(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).overrides, undefined);
  } finally {
    rmSync(launcher, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test('failed staged verification rolls back manifest and lockfile', { timeout: 30_000 }, async () => {
  const cwd = createFixture({ minimist: '0.0.8' });
  const packageBefore = readFileSync(join(cwd, 'package.json'));
  const lockBefore = readFileSync(join(cwd, 'package-lock.json'));
  try {
    await assert.rejects(
      runNpmVulnPatcher({
        cwd,
        options: {
          apply: true,
          allowNonGit: true,
          allowMajor: true,
          skipAuditFix: true,
          testCommand: 'node -e "process.exit(1)"',
          format: 'json',
        },
        output() {},
      }),
      { exitCode: EXIT_CODE.VERIFICATION_FAILURE },
    );
    assert.deepEqual(readFileSync(join(cwd, 'package.json')), packageBefore);
    assert.deepEqual(readFileSync(join(cwd, 'package-lock.json')), lockBefore);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('successful apply verifies the proposed installed dependency before commit', { timeout: 30_000 }, async () => {
  const cwd = createFixture({ minimist: '0.0.8' });
  try {
    const report = await runNpmVulnPatcher({
      cwd,
      options: {
        apply: true,
        allowNonGit: true,
        allowMajor: true,
        skipAuditFix: true,
        testCommand: `node -e "const v=require('minimist/package.json').version; if(v!=='1.2.8') process.exit(1)"`,
        format: 'json',
      },
      output() {},
    });

    assert.equal(report.status, 'committed');
    assert.equal(report.exitCode, EXIT_CODE.SUCCESS);
    assert.equal(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).dependencies.minimist, '1.2.8');
    assert.equal(
      JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8')).packages['node_modules/minimist'].version,
      '1.2.8',
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('dependency-only apply records the explicit missing-test acknowledgement', { timeout: 20_000 }, async () => {
  const cwd = createFixture();
  try {
    const report = await runNpmVulnPatcher({
      cwd,
      options: {
        apply: true,
        allowNonGit: true,
        allowNoTest: true,
        skipAuditFix: true,
        format: 'json',
      },
      output() {},
    });

    assert.equal(report.status, 'committed');
    assert.equal(report.options.allowNoTest, true);
    assert.match(report.verification.join('\n'), /dependency-only validation was accepted/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('apply rejects non-git targets unless explicitly allowed', { timeout: 20_000 }, async () => {
  const cwd = createFixture();
  try {
    await assert.rejects(
      runNpmVulnPatcher({
        cwd,
        options: { apply: true, allowNoTest: true, format: 'json' },
        output() {},
      }),
      { code: 'NON_GIT_TARGET' },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createFixture(dependencies = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'patcher-integration-'));
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify({
    name: 'patcher-fixture',
    version: '1.0.0',
    private: true,
    dependencies,
  }, null, 2)}\n`);
  const result = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--workspaces=false'], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      npm_config_dry_run: 'false',
      npm_config_package_lock: 'true',
      npm_config_workspaces: 'false',
    },
  });
  if (result.status !== 0) {
    rmSync(cwd, { recursive: true, force: true });
    throw new Error(`Unable to create npm fixture: ${result.stderr || result.stdout}`);
  }
  return cwd;
}
