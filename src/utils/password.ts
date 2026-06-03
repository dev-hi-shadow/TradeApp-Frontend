/**
 * Shared password validation used by the reset / change-password forms so the
 * client-side rules stay in one place and match the backend's MIN_PASSWORD_LEN.
 */
import _ from 'lodash';

export const MIN_PASSWORD_LEN = 6;

export interface PasswordCheck {
  ok: boolean;
  /** First failing rule's message, or '' when valid. */
  error: string;
}

/**
 * Validate a new password (and optional confirmation). Returns the first
 * problem found, mirroring the order the backend rejects in.
 */
export function validateNewPassword(password: string, confirm?: string): PasswordCheck {
  const pw = _.toString(password);
  if (_.isEmpty(pw)) return { ok: false, error: 'Password is required' };
  if (pw.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }
  if (confirm !== undefined && pw !== confirm) {
    return { ok: false, error: 'Passwords do not match' };
  }
  return { ok: true, error: '' };
}
