import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { DEADLINES } from '../src/client.js'
import researchStart from '../src/research-start.js'
import { API, KEY_PLACEHOLDER, json, networkFailure, stalledBody, stubFetch } from './helpers.js'

let fetchStub
afterEach(() => fetchStub?.restore())

const QUESTION = 'Compare the pricing of the main web search APIs for agents.'
const TEXT_SPEC = { output_schema: { type: 'text' } }

function queued(processor) {
  return json(200, {
    run_id: 'trun_1',
    status: 'queued',
    is_active: true,
    processor,
    created_at: '2026-11-04T12:00:00Z',
    modified_at: '2026-11-04T12:00:00Z',
    interaction_id: 'int_1',
  })
}

for (const processor of ['lite', 'base', 'core', 'core2x', 'pro', 'ultra']) {
  test(`research-start sends processor ${processor} verbatim with a text output spec`, async () => {
    fetchStub = stubFetch(queued(processor))
    const result = await researchStart({ input: QUESTION, processor })
    assert.deepEqual(result, { runId: 'trun_1', status: 'queued', processor })
    assert.equal(fetchStub.requests.length, 1)
    const [request] = fetchStub.requests
    assert.equal(request.method, 'POST')
    assert.equal(request.url, `${API}/v1/tasks/runs`)
    assert.equal(request.headers['x-api-key'], KEY_PLACEHOLDER)
    assert.equal(request.headers['x-stainless-timeout'], '20')
    assert.deepEqual(request.body, { input: QUESTION, processor, task_spec: TEXT_SPEC })
  })
}

test('research-start defaults to the pro processor and text output', async () => {
  fetchStub = stubFetch(queued('pro'))
  const result = await researchStart({ input: QUESTION })
  assert.deepEqual(result, { runId: 'trun_1', status: 'queued', processor: 'pro' })
  assert.deepEqual(fetchStub.requests[0].body, { input: QUESTION, processor: 'pro', task_spec: TEXT_SPEC })
})

test('research-start with auto output sends no task spec', async () => {
  fetchStub = stubFetch(queued('core'))
  const result = await researchStart({ input: QUESTION, processor: 'core', output: 'auto' })
  assert.deepEqual(result, { runId: 'trun_1', status: 'queued', processor: 'core' })
  assert.deepEqual(fetchStub.requests[0].body, { input: QUESTION, processor: 'core' })
})

const PROCESSOR_ERROR = 'processor: Expected one of: lite, base, core, core2x, pro, ultra'
const ACCEPTED = 'Accepted keys: input, processor, output'
const INVALID = [
  [{ input: QUESTION, processor: 'ultra2x' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: 'ultra4x' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: 'ultra8x' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: 'ULTRA' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: 'turbo' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: '' }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: 5 }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: null }, PROCESSOR_ERROR],
  [{ input: QUESTION, processor: ['ultra'] }, PROCESSOR_ERROR],
  [{ input: QUESTION, task_spec: TEXT_SPEC }, `task_spec: unknown key. ${ACCEPTED}`],
  [{ input: QUESTION, processor_override: 'ultra8x' }, `processor_override: unknown key. ${ACCEPTED}`],
  [{ input: QUESTION, advanced_settings: {} }, `advanced_settings: unknown key. ${ACCEPTED}`],
  [{ input: { question: QUESTION, processor: 'ultra8x' } }, 'input: Expected string'],
  [{ input: '  ' }, 'input: Expected a non-empty string'],
  [{ input: QUESTION, output: 'json' }, 'output: Expected one of: text, auto'],
  [{}, 'input: Expected string'],
]

for (const [input, message] of INVALID) {
  test(`research-start rejects ${JSON.stringify(input).replace(QUESTION, '…')} without a request`, async () => {
    fetchStub = stubFetch()
    await assert.rejects(researchStart(input), { message: `@danj/parallel/research-start: ${message}` })
    assert.equal(fetchStub.requests.length, 0)
  })
}

const UNCONFIRMED =
  'A paid run may have started anyway. Check https://platform.parallel.ai before you start another.'

test('research-start does not retry a server error and warns that a run may exist', async () => {
  fetchStub = stubFetch(json(500, { error: { message: 'boom' } }))
  await assert.rejects(researchStart({ input: QUESTION }), {
    message: `@danj/parallel/research-start: Parallel did not confirm the run (500 {"error":{"message":"boom"}}). ${UNCONFIRMED}`,
  })
  assert.equal(fetchStub.requests.length, 1)
})

test('research-start does not retry a network failure and warns that a run may exist', async () => {
  fetchStub = stubFetch(networkFailure)
  await assert.rejects(researchStart({ input: QUESTION }), {
    message: `@danj/parallel/research-start: Parallel did not confirm the run (Connection error.). ${UNCONFIRMED}`,
  })
  assert.equal(fetchStub.requests.length, 1)
})

test('research-start aborts a stalled response at its deadline and warns that a run may exist', async () => {
  const saved = DEADLINES['research-start']
  DEADLINES['research-start'] = 50
  try {
    fetchStub = stubFetch(stalledBody)
    await assert.rejects(researchStart({ input: QUESTION }), (error) => {
      assert.match(error.message, /^@danj\/parallel\/research-start: Parallel did not confirm the run \(/)
      assert.ok(error.message.endsWith(UNCONFIRMED))
      assert.equal(error.cause.name, 'TimeoutError')
      return true
    })
    assert.equal(fetchStub.requests.length, 1)
  } finally {
    DEADLINES['research-start'] = saved
  }
})

test('research-start throws a refusal from Parallel unchanged, since no run started', async () => {
  fetchStub = stubFetch(json(422, { error: { message: 'input too long' } }))
  await assert.rejects(researchStart({ input: QUESTION }), {
    status: 422,
    message: '422 {"error":{"message":"input too long"}}',
  })
  assert.equal(fetchStub.requests.length, 1)
})
