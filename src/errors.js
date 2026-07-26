export const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  OPERATIONAL_FAILURE: 1,
  UNRESOLVED_VULNERABILITIES: 2,
  INVALID_INPUT: 3,
  VERIFICATION_FAILURE: 4,
});

export class PatcherError extends Error {
  constructor(message, { code = 'OPERATIONAL_FAILURE', exitCode = EXIT_CODE.OPERATIONAL_FAILURE, cause } = {}) {
    super(message, { cause });
    this.name = 'PatcherError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function invalidInput(message) {
  return new PatcherError(message, {
    code: 'INVALID_INPUT',
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

export function verificationFailure(message) {
  return new PatcherError(message, {
    code: 'VERIFICATION_FAILURE',
    exitCode: EXIT_CODE.VERIFICATION_FAILURE,
  });
}
