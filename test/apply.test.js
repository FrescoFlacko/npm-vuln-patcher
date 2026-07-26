import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyPlansSafely } from '../src/apply.js';

test('retries a failed coordinated install with a fresh lockfile', () => {
  const fixture = createFixture();
  let installCalls = 0;
  const context = {
    cwd: fixture.cwd,
    run(command, args) {
      assert.equal(command, 'npm');
      if (args[0] === 'install') {
        installCalls += 1;
        const manifest = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8'));
        const isCandidate = manifest.dependencies.a === '^1.1.0';
        if (!isCandidate) return completed();
        if (existsSync(fixture.lockfilePath)) {
          return completed(1, '', 'ERESOLVE unable to resolve dependency tree');
        }
        writeFileSync(fixture.lockfilePath, `${JSON.stringify(freshLockfile(), null, 2)}\n`);
        return completed();
      }
      if (args[0] === 'audit') return completed(0, JSON.stringify(audit()));
      throw new Error(`Unexpected npm command: ${args.join(' ')}`);
    },
  };

  try {
    const report = emptyReport();
    const result = applyPlansSafely({
      context,
      packageJsonPath: fixture.packageJsonPath,
      lockfilePath: fixture.lockfilePath,
      planned: [cohortPlan()],
      initialAudit: audit('a', 'b'),
      options: applyOptions(),
      report,
    });

    assert.equal(result.acceptedCount, 1);
    assert.equal(result.resolverAttempts, 2);
    assert.equal(installCalls, 3);
    assert.equal(JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).dependencies.a, '^1.1.0');
    assert.equal(JSON.parse(readFileSync(fixture.lockfilePath, 'utf8')).packages['node_modules/a'].version, '1.1.0');
    assert.match(report.verification.join('\n'), /Validated a fresh lockfile/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test('fresh-lock fallback also runs when an incremental audit makes no improvement', () => {
  const fixture = createFixture();
  let candidateAudits = 0;
  const context = {
    cwd: fixture.cwd,
    run(command, args) {
      assert.equal(command, 'npm');
      if (args[0] === 'install') {
        const manifest = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8'));
        const isCandidate = manifest.dependencies.a === '^1.1.0';
        if (isCandidate && !existsSync(fixture.lockfilePath)) {
          writeFileSync(fixture.lockfilePath, `${JSON.stringify(freshLockfile(), null, 2)}\n`);
        }
        return completed();
      }
      if (args[0] === 'audit') {
        candidateAudits += 1;
        return completed(0, JSON.stringify(candidateAudits === 1 ? audit('a', 'b') : audit()));
      }
      throw new Error(`Unexpected npm command: ${args.join(' ')}`);
    },
  };

  try {
    const report = emptyReport();
    const result = applyPlansSafely({
      context,
      packageJsonPath: fixture.packageJsonPath,
      lockfilePath: fixture.lockfilePath,
      planned: [cohortPlan()],
      initialAudit: audit('a', 'b'),
      options: applyOptions(),
      report,
    });

    assert.equal(result.acceptedCount, 1);
    assert.equal(result.resolverAttempts, 2);
    assert.equal(candidateAudits, 2);
    assert.match(report.verification.join('\n'), /Validated a fresh lockfile/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test('validates independent override plans in one audited resolver batch', () => {
  const fixture = createFixture();
  let installCalls = 0;
  const context = {
    cwd: fixture.cwd,
    run(command, args) {
      assert.equal(command, 'npm');
      if (args[0] === 'install') {
        installCalls += 1;
        return completed();
      }
      if (args[0] === 'audit') {
        const manifest = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8'));
        return completed(0, JSON.stringify(
          manifest.overrides?.a === '1.1.0' && manifest.overrides?.b === '1.1.0'
            ? audit()
            : audit('a', 'b'),
        ));
      }
      throw new Error(`Unexpected npm command: ${args.join(' ')}`);
    },
  };

  try {
    const report = emptyReport();
    const result = applyPlansSafely({
      context,
      packageJsonPath: fixture.packageJsonPath,
      lockfilePath: fixture.lockfilePath,
      planned: [
        overridePlan('a', ['1.1.0', '1.0.1']),
        overridePlan('b', ['1.1.0', '1.0.1']),
      ],
      initialAudit: audit('a', 'b'),
      options: applyOptions(),
      report,
    });

    assert.equal(result.acceptedCount, 1);
    assert.equal(result.resolverAttempts, 1);
    assert.equal(installCalls, 2);
    assert.deepEqual(
      JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).overrides,
      { a: '1.1.0', b: '1.1.0' },
    );
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test('falls back to individual overrides when the combined batch is rejected', () => {
  const fixture = createFixture();
  let installCalls = 0;
  const context = {
    cwd: fixture.cwd,
    run(command, args) {
      assert.equal(command, 'npm');
      if (args[0] === 'install') {
        installCalls += 1;
        const overrides = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).overrides || {};
        if (installCalls === 2 && overrides.a && overrides.b) {
          return completed(1, '', 'ERESOLVE unable to resolve combined override batch');
        }
        return completed();
      }
      if (args[0] === 'audit') {
        const overrides = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).overrides || {};
        if (overrides.a && overrides.b) return completed(0, JSON.stringify(audit()));
        if (overrides.a) return completed(1, JSON.stringify(audit('b')));
        if (overrides.b) return completed(1, JSON.stringify(audit('a')));
        return completed(1, JSON.stringify(audit('a', 'b')));
      }
      throw new Error(`Unexpected npm command: ${args.join(' ')}`);
    },
  };

  try {
    const report = emptyReport();
    const result = applyPlansSafely({
      context,
      packageJsonPath: fixture.packageJsonPath,
      lockfilePath: fixture.lockfilePath,
      planned: [overridePlan('a'), overridePlan('b')],
      initialAudit: audit('a', 'b'),
      options: applyOptions(),
      report,
    });

    assert.equal(result.acceptedCount, 2);
    assert.equal(result.resolverAttempts, 3);
    assert.deepEqual(
      JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).overrides,
      { a: '1.1.0', b: '1.1.0' },
    );
    assert.match(report.notes.join('\n'), /combined override batch was rejected/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

test('enforces the resolver-attempt cap across batched fallback variants', () => {
  const fixture = createFixture();
  let installCalls = 0;
  const context = {
    cwd: fixture.cwd,
    run(command, args) {
      assert.equal(command, 'npm');
      if (args[0] === 'install') {
        installCalls += 1;
        const overrides = JSON.parse(readFileSync(fixture.packageJsonPath, 'utf8')).overrides || {};
        return Object.keys(overrides).length
          ? completed(1, '', 'ERESOLVE unable to resolve override')
          : completed();
      }
      throw new Error(`Unexpected npm command: ${args.join(' ')}`);
    },
  };

  try {
    const report = emptyReport();
    const options = { ...applyOptions(), maxResolverAttemptsPerGroup: 2 };
    const result = applyPlansSafely({
      context,
      packageJsonPath: fixture.packageJsonPath,
      lockfilePath: fixture.lockfilePath,
      planned: [
        overridePlan('a', ['1.1.0', '1.0.1']),
        overridePlan('b', ['1.1.0', '1.0.1']),
      ],
      initialAudit: audit('a', 'b'),
      options,
      report,
    });

    assert.equal(result.acceptedCount, 0);
    assert.equal(result.resolverAttempts, 2);
    assert.equal(installCalls, 3);
    assert.match(report.skipped.join('\n'), /resolver-attempt limit \(2\)/);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
});

function createFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'patcher-apply-test-'));
  const packageJsonPath = join(cwd, 'package.json');
  const lockfilePath = join(cwd, 'package-lock.json');
  writeFileSync(packageJsonPath, `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    dependencies: { a: '^1.0.0', b: '^1.0.0' },
  }, null, 2)}\n`);
  writeFileSync(lockfilePath, `${JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { a: '^1.0.0', b: '^1.0.0' } },
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0' },
    },
  }, null, 2)}\n`);
  return { cwd, packageJsonPath, lockfilePath };
}

function cohortPlan() {
  return {
    kind: 'root-peer-cohort',
    targetNames: ['a', 'b'],
    allowLockRefresh: true,
    fixed: ['a and b upgraded together'],
    overrides: [],
    skipped: [],
    dependencyUpdates: new Map([
      ['a', { section: 'dependencies', spec: '^1.1.0' }],
      ['b', { section: 'dependencies', spec: '^1.1.0' }],
    ]),
    overrideUpdates: new Map(),
    overrideCandidateVersions: new Map(),
  };
}

function freshLockfile() {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { a: '^1.1.0', b: '^1.1.0' } },
      'node_modules/a': { version: '1.1.0' },
      'node_modules/b': { version: '1.1.0' },
    },
  };
}

function overridePlan(name, candidates = ['1.1.0']) {
  return {
    kind: 'single',
    targetNames: [name],
    allowLockRefresh: false,
    fixed: [],
    overrides: [`${name}: add override to ${candidates[0]}.`],
    skipped: [],
    dependencyUpdates: new Map(),
    overrideUpdates: new Map([[name, candidates[0]]]),
    overrideCandidateVersions: new Map([[name, candidates]]),
  };
}

function audit(...names) {
  const vulnerabilities = Object.fromEntries(names.map((name) => [name, {
    name,
    severity: 'high',
    isDirect: true,
    via: [{ source: `${name}-advisory`, range: '<1.1.0' }],
    effects: [],
    range: '<1.1.0',
    nodes: [`node_modules/${name}`],
    fixAvailable: true,
  }]));
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: names.length,
        critical: 0,
        total: names.length,
      },
    },
  };
}

function completed(status = 0, stdout = '', stderr = '') {
  return { error: null, signal: null, status, stdout, stderr };
}

function applyOptions() {
  return {
    severity: 'high',
    allowPeerWarnings: false,
    refreshLockfile: true,
    maxResolverAttemptsPerGroup: 6,
  };
}

function emptyReport() {
  return {
    fixed: [],
    overrides: [],
    skipped: [],
    verification: [],
    notes: [],
  };
}
