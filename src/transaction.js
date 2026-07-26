import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { PatcherError } from './errors.js';

const EXCLUDED_TOP_LEVEL_NAMES = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
]);
const JOURNAL_NAME = '.npm-vuln-patcher-journal.json';

export async function runInStagedWorkspace(targetContext, callback) {
  const lockPath = join(targetContext.cwd, '.npm-vuln-patcher.lock');
  const lockHandle = acquireLock(lockPath);
  let snapshot;
  let temporaryRoot;
  let stagedCwd;
  try {
    recoverInterruptedCommit(targetContext.cwd);
    snapshot = snapshotProjectFiles(targetContext.cwd);
    temporaryRoot = mkdtempSync(join(tmpdir(), 'npm-vuln-patcher-'));
    chmodSync(temporaryRoot, 0o700);
    stagedCwd = join(temporaryRoot, 'project');
  } catch (error) {
    closeSync(lockHandle);
    rmSync(lockPath, { force: true });
    throw error;
  }
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    closeSync(lockHandle);
    rmSync(lockPath, { force: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
  };
  const signalHandlers = new Map(['SIGINT', 'SIGTERM'].map((signal) => [
    signal,
    () => {
      cleanup();
      process.removeAllListeners(signal);
      process.kill(process.pid, signal);
    },
  ]));
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);

  try {
    cpSync(targetContext.cwd, stagedCwd, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      filter: (source) => shouldCopy(targetContext.cwd, source),
    });
    const stagedContext = targetContext.withCwd(stagedCwd);
    const value = await callback({ stagedContext, snapshot });
    commitStagedProject({ targetCwd: targetContext.cwd, stagedCwd, snapshot });
    return value;
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    cleanup();
  }
}

function snapshotProjectFiles(cwd) {
  return {
    packageJson: snapshotFile(join(cwd, 'package.json')),
    lockfile: snapshotFile(join(cwd, 'package-lock.json')),
  };
}

function commitStagedProject({ targetCwd, stagedCwd, snapshot }) {
  const targetPackageJson = join(targetCwd, 'package.json');
  const targetLockfile = join(targetCwd, 'package-lock.json');
  assertUnchanged(targetPackageJson, snapshot.packageJson.content);
  assertUnchanged(targetLockfile, snapshot.lockfile.content);

  const nextPackageJson = readFileSync(join(stagedCwd, 'package.json'));
  const nextLockfile = readFileSync(join(stagedCwd, 'package-lock.json'));
  if (nextPackageJson.equals(snapshot.packageJson.content) && nextLockfile.equals(snapshot.lockfile.content)) return;

  const id = randomUUID();
  const packageTemp = join(dirname(targetPackageJson), `.${basename(targetPackageJson)}.${id}.tmp`);
  const lockTemp = join(dirname(targetLockfile), `.${basename(targetLockfile)}.${id}.tmp`);
  const packageBackup = join(dirname(targetPackageJson), `.${basename(targetPackageJson)}.${id}.bak`);
  const lockBackup = join(dirname(targetLockfile), `.${basename(targetLockfile)}.${id}.bak`);
  const journalPath = join(targetCwd, JOURNAL_NAME);

  try {
    writeFileSync(packageTemp, nextPackageJson, { mode: snapshot.packageJson.mode });
    writeFileSync(lockTemp, nextLockfile, { mode: snapshot.lockfile.mode });
    writeFileSync(packageBackup, snapshot.packageJson.content, { mode: 0o600 });
    writeFileSync(lockBackup, snapshot.lockfile.content, { mode: 0o600 });
    writeFileSync(journalPath, `${JSON.stringify({
      version: 1,
      packageBackup: basename(packageBackup),
      lockBackup: basename(lockBackup),
    })}\n`, { mode: 0o600 });
    assertUnchanged(targetPackageJson, snapshot.packageJson.content);
    assertUnchanged(targetLockfile, snapshot.lockfile.content);
    renameSync(packageTemp, targetPackageJson);
    renameSync(lockTemp, targetLockfile);
  } catch (error) {
    writeFileSync(targetPackageJson, snapshot.packageJson.content, { mode: snapshot.packageJson.mode });
    writeFileSync(targetLockfile, snapshot.lockfile.content, { mode: snapshot.lockfile.mode });
    throw new PatcherError(`Unable to commit staged package files: ${error.message}`, {
      code: 'COMMIT_FAILED',
      cause: error,
    });
  } finally {
    rmSync(packageTemp, { force: true });
    rmSync(lockTemp, { force: true });
    rmSync(packageBackup, { force: true });
    rmSync(lockBackup, { force: true });
    rmSync(journalPath, { force: true });
  }
}

export function recoverInterruptedCommit(targetCwd) {
  const journalPath = join(targetCwd, JOURNAL_NAME);
  if (!existsSync(journalPath)) return false;

  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  } catch (error) {
    throw new PatcherError(`Cannot read interrupted-commit journal: ${error.message}`, {
      code: 'RECOVERY_FAILED',
      cause: error,
    });
  }

  if (
    journal.version !== 1
    || basename(journal.packageBackup || '') !== journal.packageBackup
    || basename(journal.lockBackup || '') !== journal.lockBackup
  ) {
    throw new PatcherError('Interrupted-commit journal is invalid; manual recovery is required.', {
      code: 'RECOVERY_FAILED',
    });
  }

  const packageBackup = join(targetCwd, journal.packageBackup);
  const lockBackup = join(targetCwd, journal.lockBackup);
  if (!existsSync(packageBackup) || !existsSync(lockBackup)) {
    throw new PatcherError('Interrupted-commit backups are missing; manual recovery is required.', {
      code: 'RECOVERY_FAILED',
    });
  }

  writeFileSync(join(targetCwd, 'package.json'), readFileSync(packageBackup));
  writeFileSync(join(targetCwd, 'package-lock.json'), readFileSync(lockBackup));
  rmSync(packageBackup, { force: true });
  rmSync(lockBackup, { force: true });
  rmSync(journalPath, { force: true });
  return true;
}

function acquireLock(lockPath) {
  try {
    return openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    throw new PatcherError(`Another patcher run may be active; unable to acquire ${lockPath}.`, {
      code: 'TRANSACTION_LOCKED',
      cause: error,
    });
  }
}

function snapshotFile(path) {
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new PatcherError(`Required file does not exist or is not a regular file: ${path}`, {
      code: 'MISSING_PROJECT_FILE',
    });
  }
  return {
    content: readFileSync(path),
    mode: statSync(path).mode,
  };
}

function assertUnchanged(path, original) {
  let current;
  try {
    current = readFileSync(path);
  } catch (error) {
    throw new PatcherError(`Target file changed or disappeared during validation: ${path}`, {
      code: 'CONCURRENT_MODIFICATION',
      cause: error,
    });
  }
  if (!current.equals(original)) {
    throw new PatcherError(`Target file changed during validation: ${path}`, {
      code: 'CONCURRENT_MODIFICATION',
    });
  }
}

function shouldCopy(root, source) {
  const relativePath = relative(resolve(root), resolve(source));
  if (!relativePath) return true;
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..') return false;
  const first = relativePath.split(sep)[0];
  if (EXCLUDED_TOP_LEVEL_NAMES.has(first)) return false;
  if (first === '.env' || first.startsWith('.env.')) return false;
  if (lstatSync(source).isSymbolicLink()) return false;
  return !first.startsWith('.npm-vuln-patcher-')
    && first !== '.npm-vuln-patcher.lock'
    && first !== JOURNAL_NAME;
}
