// 领域错误：审定后台的所有拒绝都带稳定错误码，便于上层映射与审计。
export class DomainError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const ERR = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID: 'INVALID',
  ORIGINAL_IMMUTABLE: 'ORIGINAL_IMMUTABLE',
  RELEASED_IMMUTABLE: 'RELEASED_IMMUTABLE',
  MISSING_SOURCE: 'MISSING_SOURCE',
  MISSING_SIGNOFF: 'MISSING_SIGNOFF',
  WRONG_EXPERT: 'WRONG_EXPERT',
  MISSING_RATIONALE: 'MISSING_RATIONALE',
  LICENSE_FORBIDS: 'LICENSE_FORBIDS',
  NO_RELEASED_CAPTION: 'NO_RELEASED_CAPTION',
  STATE_CONFLICT: 'STATE_CONFLICT',
});

export function fail(code, message, details) {
  throw new DomainError(code, message, details);
}
