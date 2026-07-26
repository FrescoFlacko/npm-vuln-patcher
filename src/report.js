import { EXIT_CODE } from './errors.js';

export function createReport(options) {
  return {
    options: publicOptions(options),
    status: 'planned',
    exitCode: EXIT_CODE.SUCCESS,
    fixed: [],
    overrides: [],
    skipped: [],
    remaining: [],
    unresolved: [],
    verification: [],
    notes: [],
    previewPackageJson: null,
  };
}

export function finishReport(report, output = console.log) {
  if (report.options.format === 'json') {
    output(JSON.stringify(report, null, 2));
  } else {
    output('');
    output(buildReportMarkdown(report).trimEnd());
    output('[npm-vuln-patcher] Done.');
  }
}

function buildReportMarkdown(report) {
  const lines = [
    '# NPM Vulnerability Patcher Summary',
    '',
    `Status: ${report.status}`,
    `Minimum severity: ${report.options.severity}`,
    `Mode: ${report.options.apply ? 'apply' : 'dry-run'}`,
    `Exit code: ${report.exitCode}`,
    '',
    '## Fixed / Planned',
    ...markdownList(report.fixed),
    '',
    '## Overrides',
    ...markdownList(report.overrides),
    '',
    '## Skipped',
    ...markdownList(report.skipped),
    '',
    '## Remaining Vulnerabilities',
    ...markdownList(report.remaining),
    '',
    '## Unresolved Package Guidance',
    ...markdownUnresolved(report.unresolved),
    '',
    '## Verification',
    ...markdownList(report.verification),
    '',
    '## Notes',
    ...markdownList(report.notes),
  ];

  if (report.previewPackageJson) {
    lines.push('', '## Dry Run package.json Preview', '', '```json');
    lines.push(JSON.stringify(report.previewPackageJson, null, 2));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

function markdownList(items) {
  return items.length ? items.map((item) => `- ${item}`) : ['- None'];
}

function markdownUnresolved(items) {
  if (!items.length) return ['- None'];

  return items.flatMap((item) => {
    const current = item.currentVersion ? `@${item.currentVersion}` : '';
    const attempted = item.attemptedUpdates.length
      ? item.attemptedUpdates.map((entry) => `${entry.package}@${entry.version}`).join(', ')
      : 'None recorded';
    const flags = item.suggestedFlags.length ? item.suggestedFlags.join(', ') : 'None';
    const lines = [
      `- \`${item.package}${current}\` — \`${item.reasonCode}\``,
      `  - Attempted updates: ${attempted}`,
      `  - Why: ${item.reason}`,
      `  - Next step: ${item.suggestedAction}`,
      `  - Suggested flags: ${flags}`,
    ];
    if (item.blockingEvidence.length) {
      lines.push(`  - Blocking evidence: ${item.blockingEvidence.join('; ')}`);
    }
    return lines;
  });
}

function publicOptions(options) {
  return {
    severity: options.severity,
    apply: options.apply,
    allowNoTest: options.allowNoTest,
    allowMajor: options.allowMajor,
    fallbackOverrides: options.fallbackOverrides,
    format: options.format,
    maxPeerClosureRounds: options.maxPeerClosureRounds,
    maxPackagesPerGroup: options.maxPackagesPerGroup,
    maxCandidatesPerPackage: options.maxCandidatesPerPackage,
    maxResolverAttemptsPerGroup: options.maxResolverAttemptsPerGroup,
    maxFixpointPasses: options.maxFixpointPasses,
    refreshLockfile: options.refreshLockfile,
  };
}
