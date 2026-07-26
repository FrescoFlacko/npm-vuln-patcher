import { invalidInput } from './errors.js';

export const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const OUTPUT_FORMATS = ['markdown', 'json'];

const DEFAULT_OPTIONS = Object.freeze({
  severity: 'low',
  apply: false,
  allowDirty: false,
  allowNonGit: false,
  allowMajor: false,
  fallbackOverrides: true,
  preferParentUpgrade: true,
  skipAuditFix: false,
  allowPeerWarnings: false,
  skipPeerDependencyCandidates: true,
  allowInstallScripts: false,
  allowNoTest: false,
  testCommand: '',
  format: 'markdown',
  maxParentVersions: 5,
  peerCheckDepth: 1,
  maxPeerClosureRounds: 3,
  maxPackagesPerGroup: 24,
  maxCandidatesPerPackage: 3,
  maxResolverAttemptsPerGroup: 6,
  maxFixpointPasses: 3,
  refreshLockfile: true,
  timeoutMs: 120_000,
});

export function parseArgs(args) {
  const values = {};
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (seen.has(arg)) throw invalidInput(`Duplicate argument: ${arg}`);
    seen.add(arg);

    if (arg === '--dry-run') {
      if (seen.has('--apply')) throw invalidInput('Use either --dry-run or --apply, not both.');
      values.apply = false;
    } else if (arg === '--apply') {
      if (seen.has('--dry-run')) throw invalidInput('Use either --dry-run or --apply, not both.');
      values.apply = true;
    } else if (arg === '--allow-dirty') {
      values.allowDirty = true;
    } else if (arg === '--allow-non-git') {
      values.allowNonGit = true;
    } else if (arg === '--allow-major') {
      values.allowMajor = true;
    } else if (arg === '--no-overrides') {
      values.fallbackOverrides = false;
    } else if (arg === '--skip-audit-fix') {
      values.skipAuditFix = true;
    } else if (arg === '--allow-peer-warnings') {
      values.allowPeerWarnings = true;
    } else if (arg === '--allow-peer-dependency-candidates') {
      values.skipPeerDependencyCandidates = false;
    } else if (arg === '--allow-install-scripts') {
      values.allowInstallScripts = true;
    } else if (arg === '--allow-no-test') {
      values.allowNoTest = true;
    } else if (arg === '--no-lock-refresh') {
      values.refreshLockfile = false;
    } else if (arg === '--severity') {
      values.severity = consumeValue(arg, next);
      index += 1;
    } else if (arg === '--test') {
      values.testCommand = consumeValue(arg, next);
      index += 1;
    } else if (arg === '--format') {
      values.format = consumeValue(arg, next);
      index += 1;
    } else if (arg === '--max-parent-versions') {
      values.maxParentVersions = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--peer-check-depth') {
      values.peerCheckDepth = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--max-peer-closure-rounds') {
      values.maxPeerClosureRounds = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--max-packages-per-group') {
      values.maxPackagesPerGroup = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--max-candidates-per-package') {
      values.maxCandidatesPerPackage = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--max-resolver-attempts-per-group') {
      values.maxResolverAttemptsPerGroup = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--max-fixpoint-passes') {
      values.maxFixpointPasses = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--timeout-ms') {
      values.timeoutMs = Number(consumeValue(arg, next));
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      values.help = true;
    } else {
      throw invalidInput(`Unknown argument: ${arg}`);
    }
  }

  return validateOptions(values);
}

export function validateOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidInput('Options must be an object.');
  }

  const allowed = new Set([...Object.keys(DEFAULT_OPTIONS), 'help']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw invalidInput(`Unknown option: ${key}`);
  }

  const options = { ...DEFAULT_OPTIONS, ...input };
  if (!SEVERITY_ORDER.includes(options.severity)) {
    throw invalidInput(`Invalid severity "${options.severity}". Use one of: ${SEVERITY_ORDER.join(', ')}.`);
  }
  if (!OUTPUT_FORMATS.includes(options.format)) {
    throw invalidInput(`Invalid format "${options.format}". Use one of: ${OUTPUT_FORMATS.join(', ')}.`);
  }

  assertBooleanOptions(options);
  assertInteger('maxParentVersions', options.maxParentVersions, 1, 500);
  assertInteger('peerCheckDepth', options.peerCheckDepth, 0, 10);
  assertInteger('maxPeerClosureRounds', options.maxPeerClosureRounds, 1, 10);
  assertInteger('maxPackagesPerGroup', options.maxPackagesPerGroup, 2, 100);
  assertInteger('maxCandidatesPerPackage', options.maxCandidatesPerPackage, 1, 10);
  assertInteger('maxResolverAttemptsPerGroup', options.maxResolverAttemptsPerGroup, 1, 20);
  assertInteger('maxFixpointPasses', options.maxFixpointPasses, 1, 10);
  assertInteger('timeoutMs', options.timeoutMs, 1_000, 600_000);

  if (typeof options.testCommand !== 'string') throw invalidInput('testCommand must be a string.');
  if (options.apply && !options.help && !options.testCommand.trim() && !options.allowNoTest) {
    throw invalidInput('Apply mode requires --test <command>. Use --allow-no-test only to explicitly accept dependency-only validation.');
  }
  if (options.testCommand.trim() && options.allowNoTest) {
    throw invalidInput('Use either --test <command> or --allow-no-test, not both.');
  }
  if (options.allowNoTest && !options.apply) {
    throw invalidInput('--allow-no-test requires --apply.');
  }
  return Object.freeze(options);
}

function consumeValue(arg, value) {
  if (!value || value.startsWith('--')) throw invalidInput(`${arg} requires a value.`);
  return value;
}

function assertInteger(name, value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw invalidInput(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function assertBooleanOptions(options) {
  const names = [
    'apply',
    'allowDirty',
    'allowNonGit',
    'allowMajor',
    'fallbackOverrides',
    'preferParentUpgrade',
    'skipAuditFix',
    'allowPeerWarnings',
    'skipPeerDependencyCandidates',
    'allowInstallScripts',
    'allowNoTest',
    'refreshLockfile',
  ];
  for (const name of names) {
    if (typeof options[name] !== 'boolean') throw invalidInput(`${name} must be a boolean.`);
  }
}

export function printHelp(output = console.log) {
  output(`Usage: npm-vuln-patcher [options]

Runs in dry-run mode unless --apply is provided.

Options:
  --dry-run                 Print planned package.json changes without writing files (default).
  --apply                   Validate changes in staging, then atomically update package files.
  --allow-dirty             Permit apply in a dirty git worktree.
  --allow-non-git           Permit apply when the target is not a git worktree.
  --allow-major             Allow direct or parent upgrades across major versions.
  --no-overrides            Do not add npm overrides as a fallback.
  --skip-audit-fix          Skip the staged npm audit fix --package-lock-only pass.
  --allow-peer-warnings     Permit newly introduced npm peer warning lines.
  --allow-peer-dependency-candidates
                            Consider candidates with compatible peerDependencies.
  --allow-install-scripts   Permit dependency lifecycle scripts in staged npm ci.
  --allow-no-test           Explicitly accept dependency-only validation without an application test.
  --no-lock-refresh         Disable controlled fresh-lock fallback for root peer cohorts.
  --severity <level>        info, low, moderate, high, or critical. Default: low.
  --test <command>          Verification command run in the staged installed project.
  --format <format>         markdown or json. Default: markdown.
  --max-parent-versions <n> Candidate limit from 1 to 500. Default: 5.
  --peer-check-depth <n>    Peer traversal depth from 0 to 10. Default: 1.
  --max-peer-closure-rounds <n>
                            Root peer closure rounds from 1 to 10. Default: 3.
  --max-packages-per-group <n>
                            Root packages per coordinated group from 2 to 100. Default: 24.
  --max-candidates-per-package <n>
                            Candidate shortlist size from 1 to 10. Default: 3.
  --max-resolver-attempts-per-group <n>
                            npm resolution attempts per group from 1 to 20. Default: 6.
  --max-fixpoint-passes <n> Planning passes from 1 to 10. Default: 3.
  --timeout-ms <n>          Command timeout from 1000 to 600000. Default: 120000.
`);
}
