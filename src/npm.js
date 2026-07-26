import { assertCommandCompleted, redact } from './execution-context.js';
import { PatcherError, verificationFailure } from './errors.js';
import { validateAuditReport } from './audit.js';

export const NPM_COMMAND_ENV = Object.freeze({
  npm_config_dry_run: 'false',
  npm_config_package_lock: 'true',
  npm_config_workspaces: 'false',
});

export function runNpmAudit(context, options) {
  const result = context.run('npm', ['audit', '--json', `--audit-level=${options.severity}`, '--workspaces=false'], {
    env: NPM_COMMAND_ENV,
  });
  assertCommandCompleted(result, 'npm audit', { allowedStatuses: [0, 1] });

  const output = String(result.stdout || '').trim();
  if (!output) {
    const detail = redact(result.stderr || '').trim().slice(0, 2_000);
    throw new PatcherError(`npm audit returned no JSON output.${detail ? ` ${detail}` : ''}`, {
      code: 'INVALID_AUDIT_RESPONSE',
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new PatcherError(`npm audit returned malformed JSON: ${error.message}`, {
      code: 'INVALID_AUDIT_RESPONSE',
      cause: error,
    });
  }

  return validateAuditReport(parsed);
}

export function runPackageLockOnlyInstall(context) {
  return context.run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--workspaces=false'], {
    env: NPM_COMMAND_ENV,
  });
}

export function runStagedNpmCi(context, options) {
  const args = ['ci', '--workspaces=false'];
  if (!options.allowInstallScripts) args.push('--ignore-scripts');
  const result = context.run('npm', args, {
    env: NPM_COMMAND_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assertCommandCompleted(result, 'staged npm ci');
  return result;
}

export function runVerificationCommand(context, command, options) {
  const result = context.run(command, [], {
    env: NPM_COMMAND_ENV,
    shell: true,
    stdio: options.format === 'json' ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.signal || result.status !== 0) {
    throw verificationFailure(`Verification command failed: ${command}`);
  }
}

const npmViewCache = new Map();

export function npmViewJson(context, packageSpecifier, field) {
  const cacheKey = `${context.cwd}#${packageSpecifier}#${field}`;
  if (npmViewCache.has(cacheKey)) return npmViewCache.get(cacheKey);

  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = context.run('npm', ['view', packageSpecifier, field, '--json', '--workspaces=false'], {
      env: NPM_COMMAND_ENV,
    });
    if (!isRetryableRegistryFailure(result) || attempt === 1) break;
  }
  assertCommandCompleted(result, `npm view ${packageSpecifier} ${field}`);
  const output = String(result.stdout || '').trim();

  let value = null;
  if (output) {
    try {
      value = JSON.parse(output);
    } catch (error) {
      throw new PatcherError(`npm view returned malformed JSON for ${packageSpecifier}: ${error.message}`, {
        code: 'INVALID_REGISTRY_RESPONSE',
        cause: error,
      });
    }
  }

  npmViewCache.set(cacheKey, value);
  return value;
}

function isRetryableRegistryFailure(result) {
  const errorCode = result.error?.code;
  if (['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN'].includes(errorCode)) return true;
  return /(ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|network timeout)/i.test(
    `${result.stderr || ''}\n${result.stdout || ''}`,
  );
}

export function getDeprecationMessage(context, packageName, version) {
  const value = npmViewJson(context, `${packageName}@${version}`, 'deprecated');
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/\s+/g, ' ').slice(0, 500);
}

export function extractPeerWarnings(output) {
  const lines = String(output).split('\n').map((line) => line.trim()).filter(Boolean);
  const patterns = [
    'ERESOLVE overriding peer dependency',
    'Could not resolve dependency:',
    'Conflicting peer dependency:',
  ];
  return lines.filter((line) => patterns.some((pattern) => line.includes(pattern)));
}
