export const API = 'https://api.parallel.ai'
export const KEY_PLACEHOLDER = '{{secret:parallel-api-key}}'

/**
 * Replace `globalThis.fetch` with a stub that answers from a queue and
 * records each request. An empty queue fails the request loudly.
 *
 * @param {...(Response | (() => Response))} replies
 */
export function stubFetch(...replies) {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init = {}) => {
    const headers = {}
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value
    })
    requests.push({
      method: init.method,
      url: String(url),
      headers,
      body: init.body == null ? undefined : JSON.parse(init.body),
    })
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected request ${init.method} ${url}`)
    return typeof reply === 'function' ? reply() : reply
  }
  return { requests, restore: () => (globalThis.fetch = original) }
}

// retry-after-ms: 0 keeps SDK retries in tests from sleeping.
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'retry-after-ms': '0' },
  })
}

export function networkFailure() {
  throw new TypeError('fetch failed')
}
