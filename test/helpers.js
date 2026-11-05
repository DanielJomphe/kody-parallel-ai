import { DatabaseSync } from 'node:sqlite'

export const API = 'https://api.parallel.ai'
export const KEY_PLACEHOLDER = '{{secret:parallel-api-key}}'

/**
 * Replace `globalThis.fetch` with a stub that answers from a queue and
 * records each request. An empty queue fails the request loudly.
 *
 * @param {...(Response | ((init: RequestInit) => Response))} replies
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
    return typeof reply === 'function' ? reply(init) : reply
  }
  return { requests, restore: () => (globalThis.fetch = original) }
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/**
 * A 200 reply whose headers arrive at once and whose body never does,
 * erroring only when the request's signal aborts, as fetch does.
 */
export function stalledBody(init) {
  const body = new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason))
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
}

export function networkFailure() {
  throw new TypeError('fetch failed')
}

export function stubStorage({ fail } = {}) {
  const db = new DatabaseSync(':memory:')
  globalThis.kodyStorage = {
    async sql(query, params = []) {
      if (fail) throw fail
      return { rows: db.prepare(query).all(...params) }
    },
  }
  return {
    db,
    restore: () => {
      delete globalThis.kodyStorage
      db.close()
    },
  }
}
