import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PatcherError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 120_000;

export function createExecutionContext({ cwd, commandRunner = defaultCommandRunner, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const requested = resolve(cwd);
  let resolved;

  try {
    resolved = realpathSync(requested);
    if (!statSync(resolved).isDirectory()) {
      throw new Error('target is not a directory');
    }
  } catch (error) {
    throw new PatcherError(`Invalid target directory "${requested}": ${error.message}`, {
      code: 'INVALID_TARGET',
      cause: error,
    });
  }

  return Object.freeze({
    cwd: resolved,
    timeoutMs,
    run(command, args, options = {}) {
      return commandRunner({
        command,
        args,
        cwd: resolved,
        timeoutMs: options.timeoutMs ?? timeoutMs,
        env: options.env,
        stdio: options.stdio,
        shell: options.shell ?? false,
      });
    },
    withCwd(nextCwd) {
      return createExecutionContext({ cwd: nextCwd, commandRunner, timeoutMs });
    },
  });
}

function defaultCommandRunner({ command, args, cwd, timeoutMs, env, stdio = ['ignore', 'pipe', 'pipe'], shell }) {
  return spawnSync(command, args, {
    cwd,
    timeout: timeoutMs,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    stdio,
    shell,
  });
}

export function assertCommandCompleted(result, description, { allowedStatuses = [0] } = {}) {
  if (result.error) {
    throw new PatcherError(`${description} failed to start: ${result.error.message}`, {
      code: 'COMMAND_START_FAILED',
      cause: result.error,
    });
  }
  if (result.signal) {
    throw new PatcherError(`${description} was terminated by ${result.signal}.`, {
      code: 'COMMAND_TERMINATED',
    });
  }
  if (!allowedStatuses.includes(result.status)) {
    const detail = redact(`${result.stderr || result.stdout || ''}`.trim()).slice(0, 2_000);
    throw new PatcherError(`${description} exited with status ${result.status}.${detail ? ` ${detail}` : ''}`, {
      code: 'COMMAND_FAILED',
    });
  }
}

export function redact(value) {
  return String(value)
    .replace(/(https?:\/\/)[^/@\s]+@/gi, '$1[REDACTED]@')
    .replace(/(token|password|authorization|_authToken)\s*[=:]\s*[^\s]+/gi, '$1=[REDACTED]');
}
