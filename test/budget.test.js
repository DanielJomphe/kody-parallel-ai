import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

import budgetSet from '../src/budget-set.js'
import extract from '../src/extract.js'
import { torontoDay } from '../src/ledger.js'
import researchOptions from '../src/research-options.js'
import researchStart from '../src/research-start.js'
import search from '../src/search.js'
import { json, stubFetch, stubStorage } from './helpers.js'

let fetchStub
let storage
beforeEach(() => {
  storage = stubStorage()
})
afterEach(() => {
  fetchStub?.restore()
  fetchStub = undefined
  storage.restore()
  mock.timers.reset()
})

const QUESTION = 'What is Parallel Web Systems?'
const BUDGET_ERROR = { code: 'budget', message: '@danj/parallel/budget: daily budget reached' }

function queued(processor) {
  return json(200, { run_id: 'trun_1', status: 'queued', is_active: true, processor })
}

const searched = () => json(200, { search_id: 'search_1', results: [] })
const extracted = () => json(200, { extract_id: 'extract_1', results: [], errors: [] })

function at(iso) {
  mock.timers.reset()
  mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) })
}

async function spentToday() {
  const { day, spentMills } = await researchOptions({})
  return { day, spentMills }
}

const MEMO_POOL = (budgetMills) => ({ key: 'memo-auto', budgetMills })

test('research-start reserves and sends the requested tier when it fits the pool', async () => {
  fetchStub = stubFetch(queued('pro'))
  const result = await researchStart({
    input: QUESTION,
    processor: 'pro',
    fallbackProcessor: 'lite',
    pool: MEMO_POOL(250),
  })
  assert.deepEqual(result, { runId: 'trun_1', status: 'queued', processor: 'pro' })
  assert.equal(fetchStub.requests[0].body.processor, 'pro')
  const { spentMills, pools } = await researchOptions({})
  assert.deepEqual({ spentMills, pools }, { spentMills: 100, pools: { 'memo-auto': 100 } })
})

test('research-start falls back when the pool cannot hold the requested tier', async () => {
  fetchStub = stubFetch(queued('lite'))
  const result = await researchStart({
    input: QUESTION,
    processor: 'pro',
    fallbackProcessor: 'lite',
    pool: MEMO_POOL(50),
  })
  assert.deepEqual(result, { runId: 'trun_1', status: 'queued', processor: 'lite' })
  assert.equal(fetchStub.requests[0].body.processor, 'lite')
  const { spentMills, pools } = await researchOptions({})
  assert.deepEqual({ spentMills, pools }, { spentMills: 5, pools: { 'memo-auto': 5 } })
})

test('research-start falls back when the day cannot hold the requested tier', async () => {
  await budgetSet({ budgetMills: 120 })
  fetchStub = stubFetch(queued('pro'), queued('base'))
  await researchStart({ input: QUESTION, processor: 'pro' })
  const result = await researchStart({ input: QUESTION, processor: 'pro', fallbackProcessor: 'base' })
  assert.equal(result.processor, 'base')
  assert.equal((await researchOptions({})).spentMills, 110)
})

test('research-start refuses with a budget error and sends nothing when neither tier fits', async () => {
  fetchStub = stubFetch()
  await assert.rejects(
    researchStart({ input: QUESTION, processor: 'pro', fallbackProcessor: 'lite', pool: MEMO_POOL(4) }),
    BUDGET_ERROR,
  )
  assert.equal(fetchStub.requests.length, 0)
  assert.equal((await researchOptions({})).spentMills, 0)
})

test('research-start without a fallback refuses when the pool is short', async () => {
  fetchStub = stubFetch()
  await assert.rejects(researchStart({ input: QUESTION, processor: 'core', pool: MEMO_POOL(20) }), BUDGET_ERROR)
  assert.equal(fetchStub.requests.length, 0)
})

test('the daily budget counts every caller and refuses the call that would pass it', async () => {
  await budgetSet({ budgetMills: 110 })
  fetchStub = stubFetch(queued('pro'), searched(), extracted())
  await researchStart({ input: QUESTION, processor: 'pro' })
  await search({ queries: ['parallel pricing'] })
  await extract({ urls: ['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example', 'https://e.example'] })
  assert.equal((await researchOptions({})).spentMills, 110)
  await assert.rejects(search({ queries: ['parallel pricing'] }), BUDGET_ERROR)
  await assert.rejects(extract({ urls: ['https://a.example'] }), BUDGET_ERROR)
  await assert.rejects(researchStart({ input: QUESTION, processor: 'lite' }), BUDGET_ERROR)
  assert.equal(fetchStub.requests.length, 3)
})

test('search reserves 5 mills in every mode', async () => {
  fetchStub = stubFetch(searched(), searched())
  await search({ queries: ['parallel pricing'], mode: 'turbo' })
  assert.equal((await researchOptions({})).spentMills, 5)
  await search({ queries: ['parallel pricing'], mode: 'advanced' })
  assert.equal((await researchOptions({})).spentMills, 10)
})

test('extract reserves 1 mill per URL', async () => {
  fetchStub = stubFetch(extracted())
  await extract({ urls: ['https://a.example', 'https://b.example', 'https://c.example'] })
  const { spentMills, pools } = await researchOptions({})
  assert.deepEqual({ spentMills, pools }, { spentMills: 3, pools: {} })
})

test('a stored budget above the ceiling is clamped to 1000 mills', async () => {
  assert.equal((await researchOptions({})).budgetMills, 500)
  storage.db.prepare("INSERT INTO config (k, v) VALUES ('budget', '5000')").run()
  assert.equal((await researchOptions({})).budgetMills, 1000)
  fetchStub = stubFetch(queued('ultra'), queued('ultra'), queued('ultra'), queued('pro'))
  for (const processor of ['ultra', 'ultra', 'ultra', 'pro']) await researchStart({ input: QUESTION, processor })
  await assert.rejects(search({ queries: ['parallel pricing'] }), BUDGET_ERROR)
  assert.equal((await researchOptions({})).spentMills, 1000)
})

test('budget-set stores the budget and returns it clamped to the ceiling', async () => {
  assert.deepEqual(await budgetSet({ budgetMills: 5000 }), { budgetMills: 1000 })
  assert.equal((await researchOptions({})).budgetMills, 1000)
  assert.deepEqual(await budgetSet({ budgetMills: 0 }), { budgetMills: 0 })
  fetchStub = stubFetch()
  await assert.rejects(search({ queries: ['parallel pricing'] }), BUDGET_ERROR)
  assert.equal(fetchStub.requests.length, 0)
})

test('a fresh bucket has the default budget of 500 mills', async () => {
  fetchStub = stubFetch(queued('ultra'), queued('pro'), queued('pro'))
  for (const processor of ['ultra', 'pro', 'pro']) await researchStart({ input: QUESTION, processor })
  await assert.rejects(search({ queries: ['parallel pricing'] }), BUDGET_ERROR)
  assert.equal((await researchOptions({})).budgetMills, 500)
})

for (const [name, call] of [
  ['search', () => search({ queries: ['parallel pricing'] })],
  ['extract', () => extract({ urls: ['https://a.example'] })],
  ['research-start', () => researchStart({ input: QUESTION, processor: 'lite' })],
]) {
  test(`${name} throws a storage error and sends nothing`, async () => {
    storage.restore()
    storage = stubStorage({ fail: new Error('storage unavailable') })
    fetchStub = stubFetch()
    await assert.rejects(call(), { message: 'storage unavailable' })
    assert.equal(fetchStub.requests.length, 0)
  })
}

test('an ambiguous research start stays charged', async () => {
  fetchStub = stubFetch(json(500, { error: { message: 'boom' } }))
  await assert.rejects(researchStart({ input: QUESTION, processor: 'pro' }), /A paid run may have started anyway/)
  assert.equal((await researchOptions({})).spentMills, 100)
})

test('a refused research start stays charged too', async () => {
  fetchStub = stubFetch(json(422, { error: { message: 'input too long' } }))
  await assert.rejects(researchStart({ input: QUESTION, processor: 'core' }), { status: 422 })
  assert.equal((await researchOptions({})).spentMills, 25)
})

test('the day is the America/Toronto calendar day', () => {
  assert.equal(torontoDay(new Date('2026-11-06T04:59:59.999Z')), '2026-11-05')
  assert.equal(torontoDay(new Date('2026-11-06T05:00:00.000Z')), '2026-11-06')
  assert.equal(torontoDay(new Date('2026-07-01T03:59:59.999Z')), '2026-06-30')
  assert.equal(torontoDay(new Date('2026-07-01T04:00:00.000Z')), '2026-07-01')
})

test('Toronto midnight starts a new budget day', async () => {
  await budgetSet({ budgetMills: 5 })
  fetchStub = stubFetch(searched(), searched())
  at('2026-11-06T04:59:59.999Z')
  await search({ queries: ['parallel pricing'] })
  await assert.rejects(search({ queries: ['parallel pricing'] }), BUDGET_ERROR)
  assert.deepEqual(await spentToday(), { day: '2026-11-05', spentMills: 5 })
  at('2026-11-06T05:00:00.000Z')
  await search({ queries: ['parallel pricing'] })
  assert.deepEqual(await spentToday(), { day: '2026-11-06', spentMills: 5 })
})

test('a reservation prunes rows older than 40 days', async () => {
  at('2026-11-05T17:00:00Z')
  await researchOptions({})
  const insert = storage.db.prepare(
    "INSERT INTO spend (day, pool, kind, units, at) VALUES (?, NULL, 'lite', 5, '2026-01-01T00:00:00Z')",
  )
  insert.run('2026-09-25')
  insert.run('2026-09-26')
  fetchStub = stubFetch(searched())
  await search({ queries: ['parallel pricing'] })
  const days = storage.db.prepare('SELECT day FROM spend ORDER BY day').all().map((row) => row.day)
  assert.deepEqual(days, ['2026-09-26', '2026-11-05'])
})

test('research-options reports the tiers, the day, its sums per pool, the budget and the ceiling', async () => {
  at('2026-11-05T17:00:00Z')
  fetchStub = stubFetch(queued('pro'), queued('lite'), queued('core'), queued('base'), searched())
  await researchStart({ input: QUESTION, processor: 'pro', pool: MEMO_POOL(250) })
  await researchStart({ input: QUESTION, processor: 'lite', pool: MEMO_POOL(250) })
  await researchStart({ input: QUESTION, processor: 'core', pool: { key: 'other', budgetMills: 100 } })
  await researchStart({ input: QUESTION, processor: 'base' })
  await search({ queries: ['parallel pricing'] })
  assert.deepEqual(await researchOptions({}), {
    day: '2026-11-05',
    tiers: [
      { processor: 'lite', mills: 5, shortestSeconds: 5, longestSeconds: 60 },
      { processor: 'base', mills: 10, shortestSeconds: 15, longestSeconds: 100 },
      { processor: 'core', mills: 25, shortestSeconds: 60, longestSeconds: 300 },
      { processor: 'core2x', mills: 50, shortestSeconds: 120, longestSeconds: 300 },
      { processor: 'pro', mills: 100, shortestSeconds: 180, longestSeconds: 540 },
      { processor: 'ultra', mills: 300, shortestSeconds: 300, longestSeconds: 1500 },
    ],
    spentMills: 145,
    pools: { 'memo-auto': 105, other: 25 },
    budgetMills: 500,
    ceilingMills: 1000,
  })
  assert.equal(fetchStub.requests.length, 5)
})

test('research-options counts only today', async () => {
  at('2026-11-05T17:00:00Z')
  fetchStub = stubFetch(queued('pro'))
  await researchStart({ input: QUESTION, processor: 'pro', pool: MEMO_POOL(250) })
  at('2026-11-06T17:00:00Z')
  const { day, spentMills, pools } = await researchOptions({})
  assert.deepEqual({ day, spentMills, pools }, { day: '2026-11-06', spentMills: 0, pools: {} })
})

test('research-options and budget-set reject unknown keys', async () => {
  await assert.rejects(researchOptions({ day: '2026-11-05' }), {
    message: '@danj/parallel/research-options: day: unknown key. Accepted keys: none',
  })
  await assert.rejects(budgetSet({ budgetMills: 100, ceilingMills: 2000 }), {
    message: '@danj/parallel/budget-set: ceilingMills: unknown key. Accepted keys: budgetMills',
  })
})

const BUDGET_SET_INVALID = [
  [{}, 'budgetMills: Expected number'],
  [{ budgetMills: -1 }, 'budgetMills: Expected an integer of at least 0'],
  [{ budgetMills: 1.5 }, 'budgetMills: Expected an integer of at least 0'],
  [{ budgetMills: '100' }, 'budgetMills: Expected number'],
]

for (const [input, message] of BUDGET_SET_INVALID) {
  test(`budget-set rejects ${JSON.stringify(input)} and keeps the budget`, async () => {
    await assert.rejects(budgetSet(input), { message: `@danj/parallel/budget-set: ${message}` })
    assert.equal((await researchOptions({})).budgetMills, 500)
  })
}
