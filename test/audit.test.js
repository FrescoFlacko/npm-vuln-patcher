import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAuditChange, validateAuditReport } from '../src/audit.js';

test('strict audit validation rejects missing data and error payloads', () => {
  assert.throws(() => validateAuditReport({ auditReportVersion: 2, metadata: {} }));
  assert.throws(() => validateAuditReport({ error: { summary: 'registry unavailable' } }));
  assert.throws(() => validateAuditReport({ auditReportVersion: 1, vulnerabilities: {}, metadata: {} }));
});

test('strict audit validation accepts npm audit version 2 reports', () => {
  const report = auditReport([finding('demo', 'high')]);
  assert.equal(validateAuditReport(report), report);
});

test('a lower count cannot hide a new critical vulnerability', () => {
  const baseline = auditReport([finding('low-a', 'low'), finding('low-b', 'low')]);
  const candidate = auditReport([finding('critical-c', 'critical')]);
  const result = evaluateAuditChange({ baseline, candidate, minimumSeverity: 'low' });

  assert.equal(result.accepted, false);
  assert.match(result.regressions.join('\n'), /introduced as a new critical/);
});

test('removing a target without regressions is accepted', () => {
  const baseline = auditReport([finding('demo', 'high')]);
  const candidate = auditReport([]);
  const result = evaluateAuditChange({
    baseline,
    candidate,
    minimumSeverity: 'low',
    targetName: 'demo',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.targetResolved, true);
});

test('a new advisory for an existing package is a regression', () => {
  const previous = finding('demo', 'high');
  previous.via = [{ source: 1, name: 'demo', range: '<=1.0.0' }];
  const next = finding('demo', 'high');
  next.via = [
    { source: 1, name: 'demo', range: '<=1.0.0' },
    { source: 2, name: 'demo', range: '<=1.0.0' },
  ];
  const result = evaluateAuditChange({
    baseline: auditReport([previous]),
    candidate: auditReport([next]),
    minimumSeverity: 'low',
  });
  assert.equal(result.accepted, false);
  assert.match(result.regressions.join('\n'), /new advisory 2/);
});

function auditReport(findings) {
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(findings.map((item) => [item.name, item])),
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: findings.length },
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 },
    },
  };
}

function finding(name, severity) {
  return {
    name,
    severity,
    isDirect: true,
    via: [],
    effects: [],
    range: '<=1.0.0',
    nodes: [`node_modules/${name}`],
    fixAvailable: false,
  };
}
