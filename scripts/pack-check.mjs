import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'npm-vuln-patcher-pack-'));

try {
  run('npm', ['pack', '--pack-destination', temporaryRoot, '--workspaces=false'], packageRoot);
  const tarballName = readdirSync(temporaryRoot).find((name) => name.endsWith('.tgz'));
  assert.ok(tarballName, 'npm pack did not create a tarball');
  const tarball = join(temporaryRoot, tarballName);

  const listing = run('tar', ['-tzf', tarball], packageRoot).stdout;
  for (const required of [
    'package/README.md',
    'package/LICENSE',
    'package/CHANGELOG.md',
    'package/SECURITY.md',
    'package/SUPPORT.md',
    'package/types/index.d.ts',
  ]) {
    assert.match(listing, new RegExp(`^${escapeRegExp(required)}$`, 'm'), `tarball is missing ${required}`);
  }

  writeFileSync(join(temporaryRoot, 'package.json'), `${JSON.stringify({
    name: 'pack-check-fixture',
    version: '1.0.0',
    private: true,
  }, null, 2)}\n`);
  run('npm', ['install', tarball, '--ignore-scripts', '--workspaces=false'], temporaryRoot);

  const bin = join(temporaryRoot, 'node_modules', '.bin', 'npm-vuln-patcher');
  const help = run(bin, ['--help'], temporaryRoot);
  assert.match(help.stdout, /Runs in dry-run mode unless --apply is provided/);

  const importResult = run(process.execPath, [
    '--input-type=module',
    '-e',
    'const m=await import("npm-vuln-patcher"); if(typeof m.runNpmVulnPatcher!=="function") process.exit(1)',
  ], temporaryRoot);
  assert.equal(importResult.status, 0);

  const commonJsDynamicImport = run(process.execPath, [
    '-e',
    'import("npm-vuln-patcher").then((m)=>{if(typeof m.runNpmVulnPatcher!=="function")process.exit(1)})',
  ], temporaryRoot);
  assert.equal(commonJsDynamicImport.status, 0);

  const commonJsRequire = spawnSync(process.execPath, [
    '-e',
    'require("npm-vuln-patcher")',
  ], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.notEqual(commonJsRequire.status, 0, 'synchronous CommonJS require unexpectedly succeeded');
  assert.match(
    commonJsRequire.stderr,
    /ERR_PACKAGE_PATH_NOT_EXPORTED/,
    'synchronous CommonJS require did not fail at the ESM-only export boundary',
  );

  const installedManifest = JSON.parse(readFileSync(join(temporaryRoot, 'node_modules', 'npm-vuln-patcher', 'package.json'), 'utf8'));
  assert.equal(installedManifest.name, 'npm-vuln-patcher');
  assert.equal(installedManifest.version, '0.2.0');
  assert.equal(installedManifest.types, './types/index.d.ts');

  const typeConsumer = join(temporaryRoot, 'consumer.mts');
  writeFileSync(typeConsumer, `
    import {
      runNpmVulnPatcher,
      type PatcherOptions,
      type PatcherReport,
    } from 'npm-vuln-patcher';

    const options: PatcherOptions = { severity: 'high', apply: true, testCommand: 'npm test' };
    async function consume(): Promise<PatcherReport> {
      return runNpmVulnPatcher({ cwd: '/tmp/example', options });
    }
    void consume;
  `);
  const typescriptCli = join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [
    typescriptCli,
    '--noEmit',
    '--strict',
    '--target',
    'ES2023',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    typeConsumer,
  ], temporaryRoot);
  console.log(`Validated ${tarballName}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout || result.error?.message}`);
  }
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
