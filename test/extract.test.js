import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import extract from '../src/extract.js'
import { API, KEY_PLACEHOLDER, json, stubFetch } from './helpers.js'

let fetchStub
afterEach(() => fetchStub?.restore())

const RESPONSE = {
  extract_id: 'extract_abc',
  session_id: 'session_1',
  results: [
    {
      url: 'https://docs.parallel.ai/home',
      title: 'Parallel docs',
      publish_date: '2026-09-30',
      excerpts: ['Parallel offers Search, Extract, and Task APIs.'],
      full_content: '# Parallel docs\n\nParallel offers Search, Extract, and Task APIs.',
    },
  ],
  errors: [
    {
      url: 'https://example.com/missing',
      error_type: 'http_error',
      http_status_code: 404,
      content: 'Not Found',
    },
    { url: 'https://example.invalid/', error_type: 'fetch_failed', http_status_code: null, content: null },
  ],
}

test('extract sends every option under its wire name and projects results and per-URL errors', async () => {
  fetchStub = stubFetch(json(200, RESPONSE))
  const result = await extract({
    urls: ['https://docs.parallel.ai/home', 'https://example.com/missing', 'https://example.invalid/'],
    objective: 'What products does Parallel offer?',
    queries: ['parallel products'],
    fullContent: true,
    maxCharsTotal: 8000,
  })
  assert.deepEqual(result, {
    extractId: 'extract_abc',
    results: [
      {
        url: 'https://docs.parallel.ai/home',
        title: 'Parallel docs',
        publishDate: '2026-09-30',
        excerpts: ['Parallel offers Search, Extract, and Task APIs.'],
        fullContent: '# Parallel docs\n\nParallel offers Search, Extract, and Task APIs.',
      },
    ],
    errors: [
      {
        url: 'https://example.com/missing',
        errorType: 'http_error',
        httpStatusCode: 404,
        content: 'Not Found',
      },
      { url: 'https://example.invalid/', errorType: 'fetch_failed', httpStatusCode: null, content: null },
    ],
  })
  assert.equal(fetchStub.requests.length, 1)
  const [request] = fetchStub.requests
  assert.equal(request.method, 'POST')
  assert.equal(request.url, `${API}/v1/extract`)
  assert.equal(request.headers['x-api-key'], KEY_PLACEHOLDER)
  assert.equal(request.headers['x-stainless-timeout'], '20')
  assert.deepEqual(request.body, {
    urls: ['https://docs.parallel.ai/home', 'https://example.com/missing', 'https://example.invalid/'],
    objective: 'What products does Parallel offer?',
    search_queries: ['parallel products'],
    max_chars_total: 8000,
    advanced_settings: { full_content: true },
  })
})

test('extract asks for excerpts only by default and maps a missing page title to null', async () => {
  fetchStub = stubFetch(
    json(200, {
      extract_id: 'extract_def',
      results: [{ url: 'https://example.com/', excerpts: ['Example Domain'] }],
      errors: [],
    }),
  )
  const result = await extract({ urls: ['https://example.com/'] })
  assert.deepEqual(result, {
    extractId: 'extract_def',
    results: [
      { url: 'https://example.com/', title: null, publishDate: null, excerpts: ['Example Domain'], fullContent: null },
    ],
    errors: [],
  })
  assert.deepEqual(fetchStub.requests[0].body, {
    urls: ['https://example.com/'],
    advanced_settings: { full_content: false },
  })
})

const urls = (n) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`)

test('extract accepts 20 URLs', async () => {
  fetchStub = stubFetch(json(200, { extract_id: 'extract_20', results: [], errors: [] }))
  const result = await extract({ urls: urls(20) })
  assert.deepEqual(result, { extractId: 'extract_20', results: [], errors: [] })
  assert.deepEqual(fetchStub.requests[0].body.urls, urls(20))
})

const ACCEPTED = 'Accepted keys: urls, objective, queries, fullContent, maxCharsTotal'
const INVALID = [
  [{ urls: urls(21) }, 'urls: Expected at most 20 URLs'],
  [{ urls: [] }, 'urls: Expected at least one item'],
  [{ urls: 'https://example.com/' }, 'urls: Expected array'],
  [{ urls: [''] }, 'urls.0: Expected a non-empty string'],
  [{ urls: ['https://example.com/'], queries: [] }, 'queries: Expected at least one item'],
  [{ urls: ['https://example.com/'], fullContent: 'yes' }, 'fullContent: Expected boolean'],
  [{ urls: ['https://example.com/'], maxCharsTotal: -1 }, 'maxCharsTotal: Expected a positive integer'],
  [{ urls: ['https://example.com/'], advanced_settings: {} }, `advanced_settings: unknown key. ${ACCEPTED}`],
  [{ urls: ['https://example.com/'], full_content: true }, `full_content: unknown key. ${ACCEPTED}`],
  [null, 'Expected object'],
]

for (const [input, message] of INVALID) {
  test(`extract rejects ${JSON.stringify(input)?.slice(0, 80)} without a request`, async () => {
    fetchStub = stubFetch()
    await assert.rejects(extract(input), { message: `@danj/parallel/extract: ${message}` })
    assert.equal(fetchStub.requests.length, 0)
  })
}

test('extract throws a client error from Parallel without retrying it', async () => {
  fetchStub = stubFetch(json(401, { error: { message: 'invalid api key' } }))
  await assert.rejects(extract({ urls: ['https://example.com/'] }), { status: 401 })
  assert.equal(fetchStub.requests.length, 1)
})
