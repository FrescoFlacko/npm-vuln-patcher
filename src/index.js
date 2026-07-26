import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyPlansSafely } from './apply.js';
import { filterVulnerabilities, mapVulnerabilities } from './audit.js';
import { runAuditFix } from './audit-fix.js';
import { parseArgs, printHelp, validateOptions } from './config.js';
import { planDirectRootCohorts } from './cohorts.js';
import { EXIT_CODE, PatcherError } from './errors.js';
import { createExecutionContext } from './execution-context.js';
import { assertSafeGitState } from './git.js';
import { logProgress } from './logger.js';
import { getDirectDependencies, getRootDependencySpecs, mergeManifestChanges, readJson } from './manifest.js';
import { runNpmAudit, runStagedNpmCi, runVerificationCommand } from './npm.js';
import { createReport, finishReport } from './report.js';
import { resolveVulnerability } from './resolver.js';
import { runInStagedWorkspace } from './transaction.js';
import { buildUnresolvedGuidance } from './unresolved.js';
import { createCandidateValidator } from './validation.js';

export async function runNpmVulnPatcherCli(args = [], { output = console.log } = {}) {
  const options = parseArgs(args);
  if (options.help) {
    printHelp(output);
    return { status: 'help', exitCode: EXIT_CODE.SUCCESS };
  }

  return runNpmVulnPatcher({ cwd: process.cwd(), options, output });
}

/**
 * Audits and optionally applies dependency security changes to one npm project.
 *
 * Apply mode validates all changes in an isolated staged project and commits only
 * package.json and package-lock.json after audit, install, and test gates pass.
 */
export async function runNpmVulnPatcher({
  cwd = process.cwd(),
  options: rawOptions = {},
  commandRunner,
  output = console.log,
}) {
  const options = validateOptions(rawOptions);
  const targetContext = createExecutionContext({ cwd, commandRunner, timeoutMs: options.timeoutMs });
  assertProjectFiles(targetContext.cwd);
  const report = createReport(options);

  try {
    if (!options.apply) {
      await executeProject(targetContext, options, report);
      report.status = 'dry-run';
      finishReport(report, output);
      return report;
    }

    assertSafeGitState(targetContext, options);
    await runInStagedWorkspace(targetContext, async ({ stagedContext }) => {
      await executeProject(stagedContext, options, report);
      logProgress(options, 'Installing the proposed dependency tree in staging.', output);
      runStagedNpmCi(stagedContext, options);
      report.verification.push('Staged npm ci completed successfully.');

      if (options.testCommand) {
        logProgress(options, `Running staged verification command: ${options.testCommand}`, output);
        runVerificationCommand(stagedContext, options.testCommand, options);
        report.verification.push(`Staged verification command passed: ${options.testCommand}`);
      } else if (options.allowNoTest) {
        report.verification.push(
          'Application verification was explicitly skipped with --allow-no-test; dependency-only validation was accepted.',
        );
      }
      report.status = 'validated';
    });

    report.status = 'committed';
    report.verification.push('Atomically committed validated package.json and package-lock.json.');
    finishReport(report, output);
    return report;
  } catch (error) {
    report.status = options.apply ? 'rolled-back' : 'failed';
    report.exitCode = error.exitCode ?? EXIT_CODE.OPERATIONAL_FAILURE;
    report.notes.push(error instanceof Error ? error.message : String(error));
    finishReport(report, output);
    if (error instanceof PatcherError) {
      error.reportPrinted = true;
      throw error;
    }
    const wrapped = new PatcherError(error instanceof Error ? error.message : String(error), { cause: error });
    wrapped.reportPrinted = true;
    throw wrapped;
  }
}

async function executeProject(context, options, report) {
  const packageJsonPath = join(context.cwd, 'package.json');
  const lockfilePath = join(context.cwd, 'package-lock.json');
  logProgress(options, `Reading npm audit data in ${context.cwd}.`);

  let audit = runNpmAudit(context, options);
  if (options.apply && !options.skipAuditFix) {
    audit = runAuditFix(context, options, report, audit);
  }

  let vulnerabilities = filterVulnerabilities(audit, options.severity);
  if (vulnerabilities.length === 0) {
    report.fixed.push('No vulnerabilities at or above the configured severity were found.');
    report.exitCode = EXIT_CODE.SUCCESS;
    return;
  }

  if (!options.apply) {
    const { packageJson, planned } = buildPlans({
      context,
      options,
      report,
      audit,
      packageJsonPath,
      lockfilePath,
      preferCohorts: true,
    });
    const manifestChanges = mergeManifestChanges(packageJson, planned);
    report.fixed.push(...planned.flatMap((plan) => plan.fixed));
    report.overrides.push(...planned.flatMap((plan) => plan.overrides));
    report.skipped.push(...planned.flatMap((plan) => plan.skipped));
    report.notes.push('Dry run only. No files were changed and candidate installation was not run.');
    report.previewPackageJson = manifestChanges.hasChanges ? manifestChanges.nextPackageJson : null;
    const plannedTargetNames = new Set(
      planned
        .filter((plan) => plan.dependencyUpdates.size > 0 || plan.overrideUpdates.size > 0)
        .flatMap((plan) => plan.targetNames),
    );
    addRemaining({
      report,
      vulnerabilities,
      guidanceVulnerabilities: vulnerabilities.filter((item) => !plannedTargetNames.has(item.name)),
      lockfilePath,
      options,
    });
    report.exitCode = vulnerabilities.length
      ? EXIT_CODE.UNRESOLVED_VULNERABILITIES
      : EXIT_CODE.SUCCESS;
    return;
  }

  let totalAccepted = 0;
  let completedPasses = 0;
  for (let pass = 1; pass <= options.maxFixpointPasses; pass += 1) {
    vulnerabilities = filterVulnerabilities(audit, options.severity);
    if (!vulnerabilities.length) break;

    const cohortBuild = buildPlans({
      context,
      options,
      report,
      audit,
      packageJsonPath,
      lockfilePath,
      preferCohorts: true,
    });
    let planned = cohortBuild.planned;
    let manifestChanges = mergeManifestChanges(cohortBuild.packageJson, planned);

    if (!manifestChanges.hasChanges) {
      const individualBuild = buildPlans({
        context,
        options,
        report,
        audit,
        packageJsonPath,
        lockfilePath,
        preferCohorts: false,
      });
      planned = individualBuild.planned;
      manifestChanges = mergeManifestChanges(individualBuild.packageJson, planned);
    }

    if (!manifestChanges.hasChanges) {
      report.skipped.push(...planned.flatMap((plan) => plan.skipped));
      break;
    }

    let result = applyPlansSafely({
      context,
      packageJsonPath,
      lockfilePath,
      planned,
      initialAudit: audit,
      options,
      report,
    });

    if (result.acceptedCount === 0 && planned.some((plan) => plan.kind === 'root-peer-cohort')) {
      const individualBuild = buildPlans({
        context,
        options,
        report,
        audit,
        packageJsonPath,
        lockfilePath,
        preferCohorts: false,
      });
      result = applyPlansSafely({
        context,
        packageJsonPath,
        lockfilePath,
        planned: individualBuild.planned,
        initialAudit: audit,
        options,
        report,
      });
    }

    totalAccepted += result.acceptedCount;
    audit = runNpmAudit(context, options);
    completedPasses = pass;
    report.verification.push(`Completed bounded resolution pass ${pass}/${options.maxFixpointPasses}.`);
    if (result.acceptedCount === 0) break;
  }

  vulnerabilities = filterVulnerabilities(audit, options.severity);
  addRemaining({
    report,
    vulnerabilities,
    lockfilePath,
    options,
  });
  if (totalAccepted === 0 && vulnerabilities.length) {
    report.notes.push('Bounded resolution reached a fixpoint without another safe improvement.');
  } else if (vulnerabilities.length && completedPasses === options.maxFixpointPasses) {
    report.notes.push(`Stopped at the configured maxFixpointPasses=${options.maxFixpointPasses} limit.`);
  }
  report.exitCode = vulnerabilities.length
    ? EXIT_CODE.UNRESOLVED_VULNERABILITIES
    : EXIT_CODE.SUCCESS;
}

function buildPlans({
  context,
  options,
  report,
  audit,
  packageJsonPath,
  lockfilePath,
  preferCohorts,
}) {
  const vulnerabilities = filterVulnerabilities(audit, options.severity);
  const vulnerabilityMap = mapVulnerabilities(audit);
  const packageJson = readJson(packageJsonPath);
  const lockfile = readJson(lockfilePath);
  const directDeps = getDirectDependencies(packageJson);
  const rootDependencySpecs = getRootDependencySpecs(packageJson);
  const existingOverrides = packageJson.overrides || {};
  const cohortPlans = preferCohorts
    ? planDirectRootCohorts({
        vulnerabilities,
        directDeps,
        lockfile,
        context,
        options,
        report,
      })
    : [];
  if (cohortPlans.length) return { packageJson, planned: cohortPlans };

  const validateCandidate = options.apply
    ? createCandidateValidator({ context, packageJsonPath, lockfilePath, packageJson, audit, options, report })
    : () => true;
  const planned = vulnerabilities.map((vulnerability) => resolveVulnerability({
    vulnerability,
    vulnerabilityMap,
    lockfile,
    directDeps,
    rootDependencySpecs,
    validateCandidate,
    context,
    existingOverrides,
    options,
    report,
  }));
  return { packageJson, planned };
}

function addRemaining({
  report,
  vulnerabilities,
  guidanceVulnerabilities = vulnerabilities,
  lockfilePath,
  options,
}) {
  report.remaining = vulnerabilities.map((item) => `${item.name}: ${item.severity} (${item.range || 'unknown range'})`);
  report.unresolved = buildUnresolvedGuidance({
    vulnerabilities: guidanceVulnerabilities,
    report,
    lockfile: readJson(lockfilePath),
    options,
  });
}

function assertProjectFiles(cwd) {
  for (const name of ['package.json', 'package-lock.json']) {
    if (!existsSync(join(cwd, name))) {
      throw new PatcherError(`No ${name} found in target directory.`, {
        code: 'MISSING_PROJECT_FILE',
      });
    }
  }
}

export { parseArgs, validateOptions } from './config.js';
export { EXIT_CODE, PatcherError } from './errors.js';
