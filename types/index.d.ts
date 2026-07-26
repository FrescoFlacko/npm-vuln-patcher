export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';
export type OutputFormat = 'markdown' | 'json';
export type ReportStatus = 'planned' | 'dry-run' | 'validated' | 'committed' | 'rolled-back' | 'failed';

export interface PatcherOptions {
  severity?: Severity;
  apply?: boolean;
  allowDirty?: boolean;
  allowNonGit?: boolean;
  allowMajor?: boolean;
  fallbackOverrides?: boolean;
  preferParentUpgrade?: boolean;
  skipAuditFix?: boolean;
  allowPeerWarnings?: boolean;
  skipPeerDependencyCandidates?: boolean;
  allowInstallScripts?: boolean;
  allowNoTest?: boolean;
  testCommand?: string;
  format?: OutputFormat;
  maxParentVersions?: number;
  peerCheckDepth?: number;
  maxPeerClosureRounds?: number;
  maxPackagesPerGroup?: number;
  maxCandidatesPerPackage?: number;
  maxResolverAttemptsPerGroup?: number;
  maxFixpointPasses?: number;
  refreshLockfile?: boolean;
  timeoutMs?: number;
  help?: boolean;
}

export interface ResolvedPatcherOptions {
  severity: Severity;
  apply: boolean;
  allowDirty: boolean;
  allowNonGit: boolean;
  allowMajor: boolean;
  fallbackOverrides: boolean;
  preferParentUpgrade: boolean;
  skipAuditFix: boolean;
  allowPeerWarnings: boolean;
  skipPeerDependencyCandidates: boolean;
  allowInstallScripts: boolean;
  allowNoTest: boolean;
  testCommand: string;
  format: OutputFormat;
  maxParentVersions: number;
  peerCheckDepth: number;
  maxPeerClosureRounds: number;
  maxPackagesPerGroup: number;
  maxCandidatesPerPackage: number;
  maxResolverAttemptsPerGroup: number;
  maxFixpointPasses: number;
  refreshLockfile: boolean;
  timeoutMs: number;
  help?: boolean;
}

export interface PublicReportOptions {
  severity: Severity;
  apply: boolean;
  allowNoTest: boolean;
  allowMajor: boolean;
  fallbackOverrides: boolean;
  format: OutputFormat;
  maxPeerClosureRounds: number;
  maxPackagesPerGroup: number;
  maxCandidatesPerPackage: number;
  maxResolverAttemptsPerGroup: number;
  maxFixpointPasses: number;
  refreshLockfile: boolean;
}

export interface AttemptedUpdate {
  package: string;
  version: string;
}

export interface UnresolvedPackageGuidance {
  package: string;
  severity: Severity;
  vulnerableRange: string | null;
  currentVersion: string | null;
  attemptedUpdates: AttemptedUpdate[];
  reasonCode: string;
  reason: string;
  suggestedAction: string;
  suggestedFlags: string[];
  blockingEvidence: string[];
}

export interface PatcherReport {
  options: PublicReportOptions;
  status: ReportStatus;
  exitCode: number;
  fixed: string[];
  overrides: string[];
  skipped: string[];
  remaining: string[];
  unresolved: UnresolvedPackageGuidance[];
  verification: string[];
  notes: string[];
  previewPackageJson: Record<string, unknown> | null;
}

export interface HelpReport {
  status: 'help';
  exitCode: 0;
}

export interface CommandInvocation {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  stdio?: unknown;
  shell: boolean;
}

export interface CommandResult {
  error?: Error | null;
  signal?: string | null;
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

export type CommandRunner = (invocation: CommandInvocation) => CommandResult;
export type OutputWriter = (line: string) => void;

export interface RunPatcherInput {
  cwd?: string;
  options?: PatcherOptions;
  commandRunner?: CommandRunner;
  output?: OutputWriter;
}

export function runNpmVulnPatcher(input: RunPatcherInput): Promise<PatcherReport>;
export function runNpmVulnPatcherCli(
  args?: string[],
  context?: { output?: OutputWriter },
): Promise<PatcherReport | HelpReport>;
export function parseArgs(args: string[]): Readonly<ResolvedPatcherOptions>;
export function validateOptions(input?: PatcherOptions): Readonly<ResolvedPatcherOptions>;

export const EXIT_CODE: Readonly<{
  SUCCESS: 0;
  OPERATIONAL_FAILURE: 1;
  UNRESOLVED_VULNERABILITIES: 2;
  INVALID_INPUT: 3;
  VERIFICATION_FAILURE: 4;
}>;

export class PatcherError extends Error {
  code: string;
  exitCode: number;
  reportPrinted?: boolean;
  constructor(
    message: string,
    options?: {
      code?: string;
      exitCode?: number;
      cause?: unknown;
    },
  );
}
