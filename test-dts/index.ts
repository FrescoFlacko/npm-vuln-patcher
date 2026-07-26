import {
  EXIT_CODE,
  PatcherError,
  parseArgs,
  runNpmVulnPatcher,
  runNpmVulnPatcherCli,
  validateOptions,
  type PatcherOptions,
  type PatcherReport,
  type RunPatcherInput,
  type UnresolvedPackageGuidance,
} from 'npm-vuln-patcher';

const options: PatcherOptions = {
  severity: 'high',
  apply: true,
  testCommand: 'npm test',
  format: 'json',
};
const resolved = validateOptions(options);
const parsed = parseArgs(['--severity', 'high']);
const input: RunPatcherInput = {
  cwd: '/tmp/example-project',
  options,
  output(line) {
    line.toUpperCase();
  },
};

async function exercisePublicTypes() {
  const report: PatcherReport = await runNpmVulnPatcher(input);
  const guidance: UnresolvedPackageGuidance | undefined = report.unresolved[0];
  if (guidance) guidance.attemptedUpdates.map((entry) => `${entry.package}@${entry.version}`);

  const cliReport = await runNpmVulnPatcherCli(['--help']);
  if (cliReport.status !== 'help') cliReport.remaining.map((entry) => entry.toUpperCase());
}

const error = new PatcherError('example', { code: 'EXAMPLE', exitCode: EXIT_CODE.INVALID_INPUT });

void resolved;
void parsed;
void exercisePublicTypes;
void error;
