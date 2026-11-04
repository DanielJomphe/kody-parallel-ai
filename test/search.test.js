import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { DEADLINES } from '../src/client.js'
import search from '../src/search.js'
import { API, KEY_PLACEHOLDER, json, stalledBody, stubFetch } from './helpers.js'

let fetchStub
afterEach(() => fetchStub?.restore())

const RESPONSE = {
  search_id: 'search_abc',
  session_id: 'session_1',
  results: [
    {
      url: 'https://parallel.ai/pricing',
      title: 'Pricing',
      publish_date: '2026-10-01',
      excerpts: ['Search costs $0.001 per request in fast mode.'],
    },
    { url: 'https://example.com/untitled', excerpts: ['No title here.'] },
  ],
  usage: [{ name: 'sku_search', count: 1 }],
}

test('search sends every option under its wire name and projects the results', async () => {
  fetchStub = stubFetch(json(200, RESPONSE))
  const result = await search({
    queries: ['parallel pricing', 'parallel search cost'],
    objective: 'What does Parallel charge per search?',
    mode: 'advanced',
    maxCharsTotal: 5000,
  })
  assert.deepEqual(result, {
    searchId: 'search_abc',
    results: [
      {
        url: 'https://parallel.ai/pricing',
        title: 'Pricing',
        publishDate: '2026-10-01',
        excerpts: ['Search costs $0.001 per request in fast mode.'],
      },
      {
        url: 'https://example.com/untitled',
        title: null,
        publishDate: null,
        excerpts: ['No title here.'],
      },
    ],
  })
  assert.equal(fetchStub.requests.length, 1)
  const [request] = fetchStub.requests
  assert.equal(request.method, 'POST')
  assert.equal(request.url, `${API}/v1/search`)
  assert.equal(request.headers['x-api-key'], KEY_PLACEHOLDER)
  assert.equal(request.headers['x-stainless-timeout'], '20')
  assert.deepEqual(request.body, {
    search_queries: ['parallel pricing', 'parallel search cost'],
    objective: 'What does Parallel charge per search?',
    mode: 'advanced',
    max_chars_total: 5000,
  })
})

test('search defaults to fast mode and omits options the caller left out', async () => {
  fetchStub = stubFetch(json(200, { search_id: 'search_def', results: [] }))
  const result = await search({ queries: ['kody packages'] })
  assert.deepEqual(result, { searchId: 'search_def', results: [] })
  assert.deepEqual(fetchStub.requests[0].body, { search_queries: ['kody packages'], mode: 'fast' })
})

const ACCEPTED = 'Accepted keys: queries, objective, mode, maxCharsTotal'
const INVALID = [
  [{ queries: ['a'], limit: 5 }, `limit: unknown key. ${ACCEPTED}`],
  [{ search_queries: ['a'] }, `queries: Expected array; search_queries: unknown key. ${ACCEPTED}`],
  [{ queries: [] }, 'queries: Expected at least one item'],
  [{ queries: 'a' }, 'queries: Expected array'],
  [{ queries: ['ok', ' '] }, 'queries.1: Expected a non-empty string'],
  [{ queries: [7] }, 'queries.0: Expected string'],
  [{ queries: ['a'], mode: 'slow' }, 'mode: Expected one of: turbo, fast, basic, advanced'],
  [{ queries: ['a'], maxCharsTotal: 0 }, 'maxCharsTotal: Expected a positive integer'],
  [{ queries: ['a'], maxCharsTotal: 1.5 }, 'maxCharsTotal: Expected a positive integer'],
  [{ queries: ['a'], maxCharsTotal: '100' }, 'maxCharsTotal: Expected number'],
  [undefined, 'Expected object'],
]

for (const [input, message] of INVALID) {
  test(`search rejects ${JSON.stringify(input)} without a request`, async () => {
    fetchStub = stubFetch()
    await assert.rejects(search(input), { message: `@danj/parallel/search: ${message}` })
    assert.equal(fetchStub.requests.length, 0)
  })
}

test('search throws a server error without retrying it', async () => {
  fetchStub = stubFetch(json(500, { error: { message: 'boom' } }))
  await assert.rejects(search({ queries: ['a'] }), { status: 500 })
  assert.equal(fetchStub.requests.length, 1)
})

test('search throws a 429 at once instead of sleeping for its Retry-After', async () => {
  fetchStub = stubFetch(json(429, { error: { message: 'slow down' } }, { 'retry-after': '60' }))
  const started = Date.now()
  await assert.rejects(search({ queries: ['a'] }), { status: 429 })
  assert.equal(fetchStub.requests.length, 1)
  assert.ok(Date.now() - started < 1_000, 'did not wait for Retry-After')
})

test('search aborts a response body that stalls past its deadline', async () => {
  const saved = DEADLINES.search
  DEADLINES.search = 50
  try {
    fetchStub = stubFetch(stalledBody)
    const started = Date.now()
    await assert.rejects(search({ queries: ['a'] }), { name: 'TimeoutError' })
    assert.equal(fetchStub.requests.length, 1)
    assert.ok(Date.now() - started < 1_000, 'stopped at the deadline')
  } finally {
    DEADLINES.search = saved
  }
})
