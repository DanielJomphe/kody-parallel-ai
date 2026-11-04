import Parallel from 'parallel-web'

// Kody replaces this placeholder in the outgoing x-api-key header.
export const API_KEY = '{{secret:parallel-api-key}}'

/**
 * Per-call time and retry budgets, so one export call ends well inside a
 * Kody execute run. `create` starts a paid run and is not idempotent, so it
 * never retries. `result` never retries because Parallel answers 408 while
 * the result is not ready, and the SDK would otherwise retry that.
 */
export const BUDGETS = {
  search: { timeout: 20_000, maxRetries: 1 },
  extract: { timeout: 20_000, maxRetries: 1 },
  create: { timeout: 20_000, maxRetries: 0 },
  retrieve: { timeout: 15_000, maxRetries: 1 },
  result: { timeout: 15_000, maxRetries: 0 },
}

/**
 * Build a Parallel client for one call. Pass a `BUDGETS` entry as each
 * request's options.
 * The SDK reads `globalThis.fetch` when the client is built, so a client
 * per call picks up the runtime's fetch.
 *
 * @returns {Parallel}
 */
export function parallel() {
  return new Parallel({ apiKey: API_KEY })
}
