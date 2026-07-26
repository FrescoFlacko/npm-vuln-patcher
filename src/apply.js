import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { evaluateAuditChange } from './audit.js';
import { mergeManifestChanges, writeJson } from './manifest.js';
import { extractPeerWarnings, runNpmAudit, runPackageLockOnlyInstall } from './npm.js';
import { getBaselinePeerWarnings } from './validation.js';

export function applyPlansSafely({ context, packageJsonPath, lockfilePath, planned, initialAudit, options, report }) {
  let currentAudit = initialAudit;
  let acceptedCount = 0;
  let resolverAttempts = 0;
  const baselinePeerWarnings = getBaselinePeerWarnings({ context, packageJsonPath, lockfilePath, report });
  const baselinePeerWarningSet = new Set(baselinePeerWarnings);
  const queue = coalesceOverridePlans(planned);

  for (let planIndex = 0; planIndex < queue.length; planIndex += 1) {
    const plan = queue[planIndex];
    if (!planHasManifestChanges(plan)) {
      report.skipped.push(...plan.skipped);
      continue;
    }

    let accepted = false;
    let lastReason = 'change did not safely improve the audit';
    for (const variant of expandPlanVariants(plan, options.maxResolverAttemptsPerGroup)) {
      if (plan.resolverAttemptLimit && resolverAttempts >= plan.resolverAttemptLimit) {
        lastReason = `the resolver-attempt limit (${plan.resolverAttemptLimit}) was reached`;
        break;
      }
      const packageJsonBefore = readFileSync(packageJsonPath, 'utf8');
      const lockfileBefore = readFileSync(lockfilePath, 'utf8');
      const currentPackageJson = JSON.parse(packageJsonBefore);
      const manifestChanges = mergeManifestChanges(currentPackageJson, [variant]);
      if (!manifestChanges.hasChanges) continue;

      const modes = ['incremental'];
      if (variant.allowLockRefresh && options.refreshLockfile) modes.push('fresh');
      for (const mode of modes) {
        if (mode === 'fresh') {
          rollback({ packageJsonPath, lockfilePath, packageJsonBefore, lockfileBefore });
        }
        writeJson(packageJsonPath, manifestChanges.nextPackageJson);
        if (mode === 'fresh') rmSync(lockfilePath, { force: true });

        resolverAttempts += 1;
        const install = runPackageLockOnlyInstall(context);
        const installCheck = inspectInstall(install, baselinePeerWarningSet, options);
        if (!installCheck.accepted) {
          lastReason = 'npm install --package-lock-only reported peer dependency conflicts or failed';
          report.notes.push(...installCheck.newPeerWarnings.slice(0, 5));
          continue;
        }

        const audit = runNpmAudit(context, options);
        const targetName = variant.targetNames?.length === 1 ? variant.targetNames[0] : undefined;
        const evaluation = evaluateAuditChange({
          baseline: currentAudit,
          candidate: audit,
          minimumSeverity: options.severity,
          targetName,
        });

        if (evaluation.accepted) {
          currentAudit = audit;
          acceptedCount += 1;
          report.fixed.push(...variant.fixed);
          report.overrides.push(...variant.overrides);
          report.skipped.push(...variant.skipped);
          if (mode === 'fresh') {
            report.verification.push(`Validated a fresh lockfile for ${describePlan(variant)}.`);
          }
          accepted = true;
          break;
        }

        lastReason = 'the resulting audit did not improve without regressions';
        report.notes.push(...evaluation.regressions.slice(0, 5));
      }

      if (accepted) break;
      rollback({ packageJsonPath, lockfilePath, packageJsonBefore, lockfileBefore });
    }

    if (!accepted) {
      if (plan.fallbackPlans?.length) {
        const fallbackLimit = Math.max(0, options.maxResolverAttemptsPerGroup - resolverAttempts);
        const fallbacks = plan.fallbackPlans.slice(0, fallbackLimit).map((fallbackPlan) => ({
          ...fallbackPlan,
          resolverAttemptLimit: options.maxResolverAttemptsPerGroup,
        }));
        report.notes.push(
          `The combined override batch was rejected; retrying ${fallbacks.length} of ${plan.fallbackPlans.length} plan(s) individually within the resolver-attempt limit.`,
        );
        queue.splice(planIndex + 1, 0, ...fallbacks);
      } else {
        report.skipped.push(...describeRejectedPlan(plan, lastReason));
      }
    }
  }

  report.verification.push(
    `Applied ${acceptedCount} safe fix group(s) after ${resolverAttempts} bounded npm resolver attempt(s).`,
  );
  return { acceptedCount, currentAudit, resolverAttempts };
}

function coalesceOverridePlans(plans) {
  const overridePlans = plans.filter(isPureOverridePlan);
  if (overridePlans.length < 2) return [...plans];

  const overrideSet = new Set(overridePlans);
  const preferredOverrides = new Map();
  for (const plan of overridePlans) {
    for (const [name, initialVersion] of plan.overrideUpdates) {
      const candidates = plan.overrideCandidateVersions.get(name) || [initialVersion];
      preferredOverrides.set(name, candidates[0] || initialVersion);
    }
  }
  const batch = {
    kind: 'override-batch',
    targetNames: overridePlans.flatMap((plan) => plan.targetNames),
    allowLockRefresh: false,
    fixed: overridePlans.flatMap((plan) => plan.fixed),
    overrides: [...preferredOverrides].map(([name, version]) => `${name}: add override to ${version}.`),
    skipped: overridePlans.flatMap((plan) => plan.skipped),
    dependencyUpdates: new Map(),
    overrideUpdates: preferredOverrides,
    overrideCandidateVersions: new Map(),
    fallbackPlans: overridePlans,
  };
  const firstIndex = plans.findIndex((plan) => overrideSet.has(plan));
  const result = plans.filter((plan) => !overrideSet.has(plan));
  result.splice(firstIndex, 0, batch);
  return result;
}

function isPureOverridePlan(plan) {
  return plan.dependencyUpdates.size === 0 && plan.overrideUpdates.size > 0;
}

function planHasManifestChanges(plan) {
  return plan.dependencyUpdates.size > 0 || plan.overrideUpdates.size > 0;
}

function describeRejectedPlan(plan, reason) {
  const descriptions = [...plan.fixed, ...plan.overrides];
  return descriptions.length ? descriptions.map((description) => `${description}: skipped because ${reason}.`) : [`Skipped planned change: ${reason}.`];
}

function inspectInstall(install, baselinePeerWarningSet, options) {
  const peerWarnings = extractPeerWarnings(`${install.stderr || ''}\n${install.stdout || ''}`);
  const newPeerWarnings = peerWarnings.filter((warning) => !baselinePeerWarningSet.has(warning));
  return {
    accepted: !install.error
      && !install.signal
      && install.status === 0
      && (!newPeerWarnings.length || options.allowPeerWarnings),
    newPeerWarnings,
  };
}

function expandPlanVariants(plan, maximumAttempts) {
  if (!plan.overrideCandidateVersions?.size) return [plan];
  const entries = [...plan.overrideCandidateVersions];
  if (entries.length !== 1) return [plan];
  const [[name, versions]] = entries;
  return versions.slice(0, maximumAttempts).map((version) => ({
    ...plan,
    overrideUpdates: new Map(plan.overrideUpdates).set(name, version),
    overrides: plan.overrides.map((description) => (
      description.startsWith(`${name}: add override to `)
        ? `${name}: add override to ${version}.`
        : description
    )),
  }));
}

function describePlan(plan) {
  if (plan.kind === 'root-peer-cohort') {
    return `root peer cohort (${plan.targetNames.join(', ')})`;
  }
  if (plan.kind === 'override-batch') return `override batch (${plan.targetNames.join(', ')})`;
  return plan.targetNames?.[0] || 'planned dependency change';
}

function rollback({ packageJsonPath, lockfilePath, packageJsonBefore, lockfileBefore }) {
  writeFileSync(packageJsonPath, packageJsonBefore);
  writeFileSync(lockfilePath, lockfileBefore);
}
