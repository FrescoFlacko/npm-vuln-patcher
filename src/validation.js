import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateAuditChange } from './audit.js';
import { assertCommandCompleted } from './execution-context.js';
import { writeJson } from './manifest.js';
import { extractPeerWarnings, runNpmAudit, runPackageLockOnlyInstall } from './npm.js';
import { updateDependencySpec } from './package-spec.js';

export function createCandidateValidator({ context, packageJsonPath, lockfilePath, packageJson, audit, options, report }) {
  const baselinePeerWarnings = getBaselinePeerWarnings({ context, packageJsonPath, lockfilePath, report });
  const state = {
    context,
    packageJsonPath,
    lockfilePath,
    basePackageJson: packageJson,
    basePackageJsonText: readFileSync(packageJsonPath, 'utf8'),
    baseLockfileText: readFileSync(lockfilePath, 'utf8'),
    baselineAudit: audit,
    baselinePeerWarningSet: new Set(baselinePeerWarnings),
    options,
    report,
  };

  return (candidate) => validateCandidateVersion(state, candidate);
}

function validateCandidateVersion(state, { dependencyUpdate, candidate, targetName }) {
  const update = updateDependencySpec(dependencyUpdate.name, dependencyUpdate.currentSpec, candidate);
  if (!update.ok) {
    state.report.notes.push(`Rejected ${dependencyUpdate.name}@${candidate}: ${update.reason}.`);
    return false;
  }

  const nextPackageJson = structuredClone(state.basePackageJson);
  if (!nextPackageJson[dependencyUpdate.section]) nextPackageJson[dependencyUpdate.section] = {};
  nextPackageJson[dependencyUpdate.section][dependencyUpdate.name] = update.spec;

  try {
    writeJson(state.packageJsonPath, nextPackageJson);
    const install = runPackageLockOnlyInstall(state.context);
    const warnings = extractPeerWarnings(`${install.stderr || ''}\n${install.stdout || ''}`);
    const newWarnings = warnings.filter((warning) => !state.baselinePeerWarningSet.has(warning));

    if (install.error || install.signal || install.status !== 0 || (newWarnings.length && !state.options.allowPeerWarnings)) {
      state.report.notes.push(`Rejected ${dependencyUpdate.name}@${candidate}: lockfile resolution failed or introduced peer conflicts.`);
      state.report.notes.push(...newWarnings.slice(0, 5));
      return false;
    }

    const audit = runNpmAudit(state.context, state.options);
    const evaluation = evaluateAuditChange({
      baseline: state.baselineAudit,
      candidate: audit,
      minimumSeverity: state.options.severity,
      targetName,
    });

    if (!evaluation.accepted) {
      state.report.notes.push(...evaluation.regressions.map((item) => `Rejected ${dependencyUpdate.name}@${candidate}: ${item}.`));
      return false;
    }

    return true;
  } finally {
    writeFileSync(state.packageJsonPath, state.basePackageJsonText);
    writeFileSync(state.lockfilePath, state.baseLockfileText);
  }
}

export function getBaselinePeerWarnings({ context, packageJsonPath, lockfilePath, report }) {
  const packageJsonBefore = readFileSync(packageJsonPath, 'utf8');
  const lockfileBefore = readFileSync(lockfilePath, 'utf8');

  try {
    const install = runPackageLockOnlyInstall(context);
    assertCommandCompleted(install, 'baseline lockfile resolution');
    const warnings = extractPeerWarnings(`${install.stderr || ''}\n${install.stdout || ''}`);
    if (warnings.length) {
      report.notes.push(`Detected ${warnings.length} pre-existing npm peer warning line(s).`);
    }
    return warnings;
  } finally {
    writeFileSync(packageJsonPath, packageJsonBefore);
    writeFileSync(lockfilePath, lockfileBefore);
  }
}
