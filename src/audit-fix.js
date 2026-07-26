import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateAuditChange } from './audit.js';
import { extractPeerWarnings, NPM_COMMAND_ENV, runNpmAudit } from './npm.js';

export function runAuditFix(context, options, report, baselineAudit) {
  const packageJsonPath = join(context.cwd, 'package.json');
  const lockfilePath = join(context.cwd, 'package-lock.json');
  const packageJsonBefore = readFileSync(packageJsonPath, 'utf8');
  const lockfileBefore = readFileSync(lockfilePath, 'utf8');

  const result = context.run('npm', ['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--workspaces=false'], {
    env: NPM_COMMAND_ENV,
  });
  const warnings = extractPeerWarnings(`${result.stderr || ''}\n${result.stdout || ''}`);

  if (result.error || result.signal || result.status !== 0 || (warnings.length && !options.allowPeerWarnings)) {
    rollback();
    report.notes.push('Rejected the staged npm audit fix because it failed or introduced peer dependency warnings.');
    report.notes.push(...warnings.slice(0, 5));
    return baselineAudit;
  }

  const candidateAudit = runNpmAudit(context, options);
  const evaluation = evaluateAuditChange({
    baseline: baselineAudit,
    candidate: candidateAudit,
    minimumSeverity: options.severity,
  });

  if (!evaluation.accepted) {
    rollback();
    report.notes.push('Rejected the staged npm audit fix because it did not safely improve the audit.');
    report.notes.push(...evaluation.regressions.slice(0, 5));
    return baselineAudit;
  }

  report.fixed.push('Accepted staged npm audit fix --package-lock-only changes.');
  return candidateAudit;

  function rollback() {
    writeFileSync(packageJsonPath, packageJsonBefore);
    writeFileSync(lockfilePath, lockfileBefore);
  }
}
