import assert from 'node:assert/strict';
import test from 'node:test';
import { createReport, finishReport } from '../src/report.js';

test('JSON output includes structured unresolved guidance without removing legacy fields', () => {
  const report = reportWithUnresolved('json');
  const output = [];

  finishReport(report, (line) => output.push(line));
  const parsed = JSON.parse(output.join('\n'));

  assert.deepEqual(parsed.remaining, ['vitest: critical (<3.2.6)']);
  assert.equal(parsed.unresolved[0].reasonCode, 'SEMVER_MAJOR_BLOCKED');
  assert.deepEqual(parsed.unresolved[0].suggestedFlags, ['--allow-major']);
  assert.ok(Array.isArray(parsed.skipped));
  assert.ok(Array.isArray(parsed.notes));
});

test('Markdown output renders the unresolved reason, attempted update, and next action together', () => {
  const report = reportWithUnresolved('markdown');
  const output = [];

  finishReport(report, (line) => output.push(line));
  const markdown = output.join('\n');

  assert.match(markdown, /## Unresolved Package Guidance/);
  assert.match(markdown, /`vitest@1\.6\.1` — `SEMVER_MAJOR_BLOCKED`/);
  assert.match(markdown, /Attempted updates: vitest@4\.1\.10/);
  assert.match(markdown, /Next step: Review the major-version migration/);
  assert.match(markdown, /Suggested flags: --allow-major/);
});

function reportWithUnresolved(format) {
  const report = createReport({
    severity: 'high',
    apply: false,
    allowNoTest: false,
    allowMajor: false,
    fallbackOverrides: true,
    format,
    maxPeerClosureRounds: 3,
    maxPackagesPerGroup: 24,
    maxCandidatesPerPackage: 3,
    maxResolverAttemptsPerGroup: 6,
    maxFixpointPasses: 3,
    refreshLockfile: true,
  });
  report.exitCode = 2;
  report.remaining = ['vitest: critical (<3.2.6)'];
  report.skipped = ['vitest: direct upgrade 1.6.1 -> 4.1.10 crosses a major version.'];
  report.unresolved = [{
    package: 'vitest',
    severity: 'critical',
    vulnerableRange: '<3.2.6',
    currentVersion: '1.6.1',
    attemptedUpdates: [{ package: 'vitest', version: '4.1.10' }],
    reasonCode: 'SEMVER_MAJOR_BLOCKED',
    reason: 'vitest: direct upgrade 1.6.1 -> 4.1.10 crosses a major version.',
    suggestedAction: 'Review the major-version migration, then rerun with --allow-major and a complete --test command.',
    suggestedFlags: ['--allow-major'],
    blockingEvidence: [],
  }];
  return report;
}
