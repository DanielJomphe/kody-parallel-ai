import Parallel from 'parallel-web'

// Kody replaces this placeholder in the outgoing x-api-key header.
export const API_KEY = '{{secret:parallel-api-key}}'

/**
 * Per-request SDK timeouts. Nothing retries: the SDK sleeps for whatever
 * Retry-After the server sends, with no upper bound, and `create` starts a
 * paid run that is not idempotent. Callers retry by calling again.
 */
export const BUDGETS = {
  search: { timeout: 20_000, maxRetries: 0 },
  extract: { timeout: 20_000, maxRetries: 0 },
  create: { timeout: 20_000, maxRetries: 0 },
  retrieve: { timeout: 15_000, maxRetries: 0 },
  result: { timeout: 15_000, maxRetries: 0 },
}

/**
 * Wall-clock limit for one export call, response bodies included. The SDK's
 * own timeout stops once headers arrive, so a stalled body would otherwise
 * hold the call open past Kody's execute budget.
 */
export const DEADLINES = {
  search: 25_000,
  extract: 25_000,
  'research-start': 25_000,
  'research-get': 35_000,
}

/**
 * Build a Parallel client for one export call. Every request it makes,
 * body reads included, aborts once `deadlineMs` has passed since this call.
 * Pass a `BUDGETS` entry as each request's options.
 * The wrapper reads `globalThis.fetch` per request, so it uses the
 * runtime's fetch.
 *
 * @param {number} deadlineMs
 * @returns {Parallel}
 */
export function parallel(deadlineMs) {
  const deadline = AbortSignal.timeout(deadlineMs)
  return new Parallel({
    apiKey: API_KEY,
    maxRetries: 0,
    fetch: (url, init = {}) =>
      globalThis.fetch(url, {
        ...init,
        signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
      }),
  })
}
