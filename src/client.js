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
    fetch: (url, { signal, ...init } = {}) =>
      abortable(url, init, signal ? AbortSignal.any([signal, deadline]) : deadline),
  })
}

/**
 * Fetch with no `signal` on the request, rejecting with `signal.reason`
 * when it aborts, before the headers or during the body. A Kody package
 * app's fetch crosses an RPC boundary that refuses a signal ("AbortSignal
 * serialization is not enabled."), so the abort is enforced here instead.
 *
 * @param {RequestInfo | URL} url
 * @param {RequestInit} init
 * @param {AbortSignal} signal
 * @returns {Promise<Response>}
 */
function abortable(url, init, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    globalThis.fetch(url, init).then(
      (response) => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) reject(signal.reason)
        else resolve(withBodyAbort(response, signal))
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

/**
 * The same response, whose body errors with `signal.reason` once the
 * signal aborts, and then cancels the original body.
 *
 * @param {Response} response
 * @param {AbortSignal} signal
 * @returns {Response}
 */
function withBodyAbort(response, signal) {
  if (response.body === null) return response
  const reader = response.body.getReader()
  let abort
  const detach = () => signal.removeEventListener('abort', abort)
  const body = new ReadableStream({
    start(controller) {
      abort = () => {
        controller.error(signal.reason)
        reader.cancel(signal.reason).catch(() => {})
      }
      signal.addEventListener('abort', abort, { once: true })
    },
    async pull(controller) {
      let chunk
      try {
        chunk = await reader.read()
      } catch (error) {
        detach()
        throw error
      }
      if (signal.aborted) return
      if (chunk.done) {
        detach()
        controller.close()
      } else controller.enqueue(chunk.value)
    },
    cancel(reason) {
      detach()
      return reader.cancel(reason)
    },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
