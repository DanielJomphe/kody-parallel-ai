import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { afterEach, beforeEach, test } from 'node:test'

import search from '../src/search.js'
import { json, stubFetch, stubStorage } from './helpers.js'

let fetchStub
let storage
let signals
const { any } = AbortSignal
beforeEach(() => {
  storage = stubStorage()
  signals = []
  AbortSignal.any = (list) => {
    const signal = any.call(AbortSignal, list)
    signals.push(signal)
    return signal
  }
})
afterEach(() => {
  AbortSignal.any = any
  fetchStub?.restore()
  storage.restore()
})

test('a call that finished leaves no abort listener on its request signal', async () => {
  fetchStub = stubFetch(json(200, { search_id: 's', session_id: 'x', results: [] }))
  await search({ queries: ['a'] })
  assert.ok(signals.length > 0, 'the request carried a signal to honor')
  for (const signal of signals) assert.equal(getEventListeners(signal, 'abort').length, 0)
})
