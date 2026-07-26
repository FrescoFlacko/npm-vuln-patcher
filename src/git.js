import { PatcherError } from './errors.js';

export function assertSafeGitState(context, options) {
  const inside = context.run('git', ['rev-parse', '--is-inside-work-tree']);

  if (inside.error) {
    throw new PatcherError(`Unable to inspect git state: ${inside.error.message}`, {
      code: 'GIT_INSPECTION_FAILED',
      cause: inside.error,
    });
  }

  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    if (options.allowNonGit) return;
    throw new PatcherError('Target is not a git worktree. Pass --allow-non-git to apply intentionally.', {
      code: 'NON_GIT_TARGET',
    });
  }

  const status = context.run('git', ['status', '--porcelain', '--untracked-files=all']);
  if (status.error || status.status !== 0) {
    throw new PatcherError('Unable to read git working-tree status.', {
      code: 'GIT_INSPECTION_FAILED',
      cause: status.error,
    });
  }

  if (status.stdout.trim() && !options.allowDirty) {
    throw new PatcherError('Git working tree is dirty. Commit/stash changes first or pass --allow-dirty.', {
      code: 'DIRTY_WORKTREE',
    });
  }
}
