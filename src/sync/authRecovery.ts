/** Small storage-safe recovery rules shared by the controller and Firebase client. */
export const AUTH_SETTLE_MS = 6_000;
export const REDIRECT_KEY = 'flipwise.auth-redirect.v1';
export const FAILURES_KEY = 'flipwise.auth-failures.v1';
export const REDIRECT_EXPLANATION = "Sign-in didn't finish in the app. Open Flipwise in Safari to sign in once, or continue without an account.";
export const AUTH_TIMEOUT_MESSAGE = 'Sign-in is taking longer than expected. Try again, or continue without an account.';
export const nextFailureCount = (count: number) => Math.min(2, Math.max(0, count) + 1);
export const canEscapeSignIn = (failures: number, timedOut = false) => failures >= 2 || timedOut;
export function redirectReturnMessage(pending: boolean, signedIn: boolean): string | null {
  return pending && !signedIn ? REDIRECT_EXPLANATION : null;
}
export function authGateState(settled: boolean, elapsedMs: number): 'loading' | 'ready' | 'timeout' {
  return settled ? 'ready' : elapsedMs >= AUTH_SETTLE_MS ? 'timeout' : 'loading';
}
export function readFailures(): number {
  try { return Math.min(2, Math.max(0, Number(localStorage.getItem(FAILURES_KEY)) || 0)); } catch { return 0; }
}
export function writeFailures(count: number) {
  try { localStorage.setItem(FAILURES_KEY, String(count)); } catch { /* session state still works */ }
}
export function redirectPending(): boolean {
  try { return localStorage.getItem(REDIRECT_KEY) === '1'; } catch { return false; }
}
export function markRedirect(pending: boolean) {
  try { if (pending) localStorage.setItem(REDIRECT_KEY, '1'); else localStorage.removeItem(REDIRECT_KEY); } catch { /* storage may be blocked */ }
}
