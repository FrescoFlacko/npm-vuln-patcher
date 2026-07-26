import { PatcherError } from './errors.js';
import { SEVERITY_ORDER } from './config.js';
import { rangeIsSubset } from './semver.js';

export function validateAuditReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw auditContractError('report must be an object');
  }
  if (value.error) {
    const summary = typeof value.error === 'object' ? value.error.summary || value.error.code : value.error;
    throw auditContractError(`npm returned an audit error${summary ? `: ${summary}` : ''}`);
  }
  if (value.auditReportVersion !== 2) {
    throw auditContractError(`unsupported auditReportVersion "${value.auditReportVersion}"`);
  }
  if (!value.vulnerabilities || typeof value.vulnerabilities !== 'object' || Array.isArray(value.vulnerabilities)) {
    throw auditContractError('report is missing a vulnerabilities object');
  }
  if (!value.metadata || typeof value.metadata !== 'object') {
    throw auditContractError('report is missing metadata');
  }
  if (!value.metadata.vulnerabilities || typeof value.metadata.vulnerabilities !== 'object') {
    throw auditContractError('metadata is missing vulnerability totals');
  }

  for (const [key, finding] of Object.entries(value.vulnerabilities)) {
    validateFinding(key, finding);
  }

  return value;
}

export function filterVulnerabilities(audit, minimumSeverity) {
  const minimum = severityRank(minimumSeverity);

  return Object.values(audit.vulnerabilities)
    .filter((item) => severityRank(item.severity) >= minimum)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.name.localeCompare(b.name));
}

export function mapVulnerabilities(audit) {
  return new Map(Object.entries(audit.vulnerabilities));
}

export function normalizeFix(fixAvailable) {
  if (!fixAvailable || fixAvailable === false || fixAvailable === true) return {};
  if (typeof fixAvailable === 'string') return { version: fixAvailable };
  if (typeof fixAvailable === 'object') {
    return {
      name: fixAvailable.name,
      version: fixAvailable.version,
      isSemVerMajor: Boolean(fixAvailable.isSemVerMajor),
    };
  }

  return {};
}

export function evaluateAuditChange({ baseline, candidate, minimumSeverity, targetName }) {
  const baselineFindings = new Map(filterVulnerabilities(baseline, minimumSeverity).map((item) => [item.name, item]));
  const candidateFindings = new Map(filterVulnerabilities(candidate, minimumSeverity).map((item) => [item.name, item]));
  const regressions = [];

  for (const [name, next] of candidateFindings) {
    const previous = baselineFindings.get(name);
    if (!previous) {
      regressions.push(`${name}: introduced as a new ${next.severity} vulnerability`);
      continue;
    }
    if (severityRank(next.severity) > severityRank(previous.severity)) {
      regressions.push(`${name}: severity increased from ${previous.severity} to ${next.severity}`);
    }

    const previousNodes = new Set(previous.nodes);
    const addedNodes = next.nodes.filter((node) => !previousNodes.has(node));
    if (addedNodes.length) {
      regressions.push(`${name}: affected nodes expanded to ${addedNodes.slice(0, 3).join(', ')}`);
    }

    if (next.range !== previous.range && !rangeIsSubset(next.range, previous.range)) {
      regressions.push(`${name}: vulnerable range expanded from "${previous.range}" to "${next.range}"`);
    }

    const previousAdvisories = new Set(advisoryIdentities(previous));
    const addedAdvisories = advisoryIdentities(next).filter((identity) => !previousAdvisories.has(identity));
    if (addedAdvisories.length) {
      regressions.push(`${name}: introduced new advisory ${addedAdvisories.slice(0, 2).join(', ')}`);
    }
  }

  const removed = [...baselineFindings.keys()].filter((name) => !candidateFindings.has(name));
  const improved = [...candidateFindings].filter(([name, next]) => {
    const previous = baselineFindings.get(name);
    if (!previous) return false;
    return severityRank(next.severity) < severityRank(previous.severity) || next.nodes.length < previous.nodes.length;
  }).map(([name]) => name);

  const targetResolved = targetName ? !candidateFindings.has(targetName) : false;

  return {
    accepted: regressions.length === 0 && (targetResolved || removed.length > 0 || improved.length > 0),
    regressions,
    removed,
    improved,
    targetResolved,
    baselineCount: baselineFindings.size,
    candidateCount: candidateFindings.size,
  };
}

function validateFinding(key, finding) {
  if (!finding || typeof finding !== 'object') throw auditContractError(`finding "${key}" must be an object`);
  if (finding.name !== key) throw auditContractError(`finding "${key}" has mismatched name`);
  if (!SEVERITY_ORDER.includes(finding.severity)) throw auditContractError(`finding "${key}" has invalid severity`);
  if (typeof finding.isDirect !== 'boolean') throw auditContractError(`finding "${key}" is missing isDirect`);
  if (typeof finding.range !== 'string') throw auditContractError(`finding "${key}" is missing range`);
  for (const field of ['via', 'effects', 'nodes']) {
    if (!Array.isArray(finding[field])) throw auditContractError(`finding "${key}" is missing ${field}`);
  }
  if (!finding.effects.every((item) => typeof item === 'string')) {
    throw auditContractError(`finding "${key}" has invalid effects`);
  }
  if (!finding.nodes.every((item) => typeof item === 'string')) {
    throw auditContractError(`finding "${key}" has invalid nodes`);
  }
  if (!finding.via.every((item) => typeof item === 'string' || (item && typeof item === 'object'))) {
    throw auditContractError(`finding "${key}" has invalid via entries`);
  }
  if (!validFixAvailable(finding.fixAvailable)) {
    throw auditContractError(`finding "${key}" has invalid fixAvailable`);
  }
}

function severityRank(severity) {
  const rank = SEVERITY_ORDER.indexOf(severity);
  if (rank === -1) throw auditContractError(`unknown severity "${severity}"`);
  return rank;
}

function auditContractError(message) {
  return new PatcherError(`Invalid npm audit response: ${message}.`, {
    code: 'INVALID_AUDIT_RESPONSE',
  });
}

function advisoryIdentities(finding) {
  return finding.via
    .filter((item) => item && typeof item === 'object')
    .map((item) => String(item.source || item.url || `${item.name || finding.name}:${item.title || item.range || 'unknown'}`))
    .sort();
}

function validFixAvailable(value) {
  if (typeof value === 'boolean' || typeof value === 'string') return true;
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.name === 'string'
    && typeof value.version === 'string'
    && typeof value.isSemVerMajor === 'boolean',
  );
}
