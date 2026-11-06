import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import researchGet from '../src/research-get.js'
import { API, KEY_PLACEHOLDER, json, stubFetch } from './helpers.js'

let fetchStub
afterEach(() => fetchStub?.restore())

const RUN_URL = `${API}/v1/tasks/runs/trun_1`
const RESULT_URL = `${API}/v1/tasks/runs/trun_1/result?timeout=10`

function run(status, extra = {}) {
  return {
    run_id: 'trun_1',
    status,
    is_active: ['queued', 'running', 'cancelling'].includes(status),
    processor: 'pro',
    created_at: '2026-11-04T12:00:00Z',
    modified_at: '2026-11-04T12:05:00Z',
    interaction_id: 'int_1',
    ...extra,
  }
}

const BASIS = [
  {
    field: 'output',
    reasoning: 'Prices come from each vendor pricing page.',
    citations: [
      {
        url: 'https://parallel.ai/pricing',
        title: 'Pricing',
        excerpts: ['Search costs $0.001 per request in fast mode.'],
      },
    ],
    confidence: 'high',
  },
]

for (const status of ['queued', 'running', 'cancelling']) {
  test(`research-get on a ${status} run says to poll again in 30 seconds, with one request`, async () => {
    fetchStub = stubFetch(json(200, run(status)))
    const result = await researchGet({ runId: 'trun_1' })
    assert.deepEqual(result, {
      runId: 'trun_1',
      status,
      processor: 'pro',
      createdAt: '2026-11-04T12:00:00Z',
      modifiedAt: '2026-11-04T12:05:00Z',
      done: false,
      retryAfterSeconds: 30,
      next: 'Call research-get again in about 30 seconds.',
    })
    assert.equal(fetchStub.requests.length, 1)
    const [request] = fetchStub.requests
    assert.equal(request.method, 'GET')
    assert.equal(request.url, RUN_URL)
    assert.equal(request.headers['x-api-key'], KEY_PLACEHOLDER)
    assert.equal(request.headers['x-stainless-timeout'], '15')
  })
}

test('research-get on a completed text run returns the report with its citations', async () => {
  fetchStub = stubFetch(
    json(200, run('completed')),
    json(200, {
      run: run('completed'),
      output: { type: 'text', content: '# Search API pricing\n\nParallel charges $0.001.', basis: BASIS },
    }),
  )
  const result = await researchGet({ runId: 'trun_1' })
  assert.deepEqual(result, {
    runId: 'trun_1',
    status: 'completed',
    processor: 'pro',
    createdAt: '2026-11-04T12:00:00Z',
    modifiedAt: '2026-11-04T12:05:00Z',
    done: true,
    next: 'Read output. output.basis holds the citations.',
    output: { type: 'text', content: '# Search API pricing\n\nParallel charges $0.001.', basis: BASIS },
  })
  assert.deepEqual(
    fetchStub.requests.map((r) => [r.method, r.url, r.headers['x-api-key'], r.headers['x-stainless-timeout']]),
    [
      ['GET', RUN_URL, KEY_PLACEHOLDER, '15'],
      ['GET', RESULT_URL, KEY_PLACEHOLDER, '15'],
    ],
  )
})

test('research-get on a completed auto run returns the JSON content and basis', async () => {
  const content = { vendors: [{ name: 'Parallel', usdPerSearch: 0.001 }] }
  const basis = [{ ...BASIS[0], field: 'vendors' }]
  fetchStub = stubFetch(
    json(200, run('completed')),
    json(200, { run: run('completed'), output: { type: 'json', content, basis } }),
  )
  const result = await researchGet({ runId: 'trun_1' })
  assert.deepEqual(result.output, { type: 'json', content, basis })
  assert.equal(result.done, true)
  assert.equal(fetchStub.requests.length, 2)
})

test('research-get reports a 408 from the result endpoint as not ready, without retrying', async () => {
  fetchStub = stubFetch(
    json(200, run('completed')),
    json(408, { error: { message: 'Run still active', ref_id: 'ref_408' } }),
  )
  const result = await researchGet({ runId: 'trun_1' })
  assert.deepEqual(result, {
    runId: 'trun_1',
    status: 'completed',
    processor: 'pro',
    createdAt: '2026-11-04T12:00:00Z',
    modifiedAt: '2026-11-04T12:05:00Z',
    done: false,
    retryAfterSeconds: 30,
    next: 'The result is not ready yet. Call research-get again in about 30 seconds.',
  })
  assert.equal(fetchStub.requests.length, 2)
})

test('research-get throws a server error from the result endpoint without retrying', async () => {
  fetchStub = stubFetch(json(200, run('completed')), json(500, { error: { message: 'boom' } }))
  await assert.rejects(researchGet({ runId: 'trun_1' }), {
    status: 500,
    message: '500 {"error":{"message":"boom"}}',
  })
  assert.equal(fetchStub.requests.length, 2)
})

test('research-get throws an unknown run id error from Parallel', async () => {
  fetchStub = stubFetch(json(404, { error: { message: 'run not found' } }))
  await assert.rejects(researchGet({ runId: 'trun_1' }), { status: 404 })
  assert.equal(fetchStub.requests.length, 1)
})

const STOP = 'Stop polling and tell the user.'
const STOPPED = [
  [
    run('failed', { error: { message: 'Processor ran out of time.', ref_id: 'ref_1' } }),
    { done: true, error: { message: 'Processor ran out of time.', refId: 'ref_1' } },
  ],
  [run('failed'), { done: true, error: { message: 'The run failed.', refId: null } }],
  [run('cancelled'), { done: true, error: { message: 'The run was cancelled.', refId: null } }],
  [
    run('action_required'),
    {
      done: false,
      error: {
        message: 'The run needs an action this package cannot take. Check the run at https://platform.parallel.ai.',
        refId: null,
      },
    },
  ],
  [
    run('paused'),
    { done: false, error: { message: 'Parallel sent a run status this package does not know.', refId: null } },
  ],
]

for (const [body, expected] of STOPPED) {
  test(`research-get on a ${body.status} run${body.error ? ' with an error' : ''} says to stop polling`, async () => {
    fetchStub = stubFetch(json(200, body))
    const result = await researchGet({ runId: 'trun_1' })
    assert.deepEqual(result, {
      runId: 'trun_1',
      status: body.status,
      processor: 'pro',
      createdAt: '2026-11-04T12:00:00Z',
      modifiedAt: '2026-11-04T12:05:00Z',
      next: STOP,
      ...expected,
    })
    assert.equal(fetchStub.requests.length, 1)
  })
}

const INVALID = [
  [{}, 'runId: Expected string'],
  [{ runId: '' }, 'runId: Expected a non-empty string'],
  [{ runId: 'trun_1', waitSeconds: 25 }, 'waitSeconds: unknown key. Accepted keys: runId'],
  [{ run_id: 'trun_1' }, 'runId: Expected string; run_id: unknown key. Accepted keys: runId'],
  ['trun_1', 'Expected object'],
]

for (const [input, message] of INVALID) {
  test(`research-get rejects ${JSON.stringify(input)} without a request`, async () => {
    fetchStub = stubFetch()
    await assert.rejects(researchGet(input), { message: `@danj/parallel/research-get: ${message}` })
    assert.equal(fetchStub.requests.length, 0)
  })
}

test('research-get passes null times through when Parallel sends none', async () => {
  fetchStub = stubFetch(json(200, run('running', { created_at: null, modified_at: null })))
  const result = await researchGet({ runId: 'trun_1' })
  assert.equal(result.createdAt, null)
  assert.equal(result.modifiedAt, null)
})
