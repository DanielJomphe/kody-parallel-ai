# @danj/parallel agent notes

This package calls Parallel at `api.parallel.ai` for web search, page
extraction, and deep research. Setup, costs, and the processor cap are in
`README.md`.

## Rules

- Never ask the user for the Parallel API key in chat. To set or replace
  it, send this link and wait until the user says it is saved:
  `https://kody.codes/connect/secret-set?name=parallel-api-key&description=Parallel%20API%20key&allowedHosts=api.parallel.ai`
- Deep research costs up to $0.30 per run. Use `pro` (the default) or a
  cheaper processor unless the user asks for `ultra`. When the user asks
  for `ultra2x`, `ultra4x`, or `ultra8x`, say that the package caps research
  at `ultra`. Do not call `api.parallel.ai` yourself to get around the cap.
- Never retry `research-start` after an error that says "A paid run may
  have started anyway". Tell the user, and let them check their runs.
- In `README.md`, link only to absolute URLs. Kody shows relative links as
  plain text.

## Imports

```js
import search from 'kody:@danj/parallel/search'
import extract from 'kody:@danj/parallel/extract'
import researchStart from 'kody:@danj/parallel/research-start'
import researchGet from 'kody:@danj/parallel/research-get'
```

Each export takes one input object. An unknown key is an error, so pass
only the keys below.

## Which export to use

| Need | Export | Input |
| --- | --- | --- |
| Find pages about a topic, or check a current fact | `search` | `{ queries: string[], objective?, mode?: 'turbo'\|'fast'\|'basic'\|'advanced', maxCharsTotal? }` |
| Read pages whose URLs you have | `extract` | `{ urls: string[] (1-20), objective?, queries?: string[], fullContent?: boolean, maxCharsTotal? }` |
| Answer a question that needs many sources and a cited report | `research-start`, then `research-get` | `{ input: string, processor?, output?: 'text'\|'auto' }`, then `{ runId }` |

- `search` returns `{ searchId, results: [{ url, title, publishDate, excerpts }] }`.
  Give 1 to 3 keyword queries of 3 to 6 words, plus an `objective` in plain
  words. `mode` defaults to `fast`.
- `extract` returns `{ extractId, results: [{ url, title, publishDate, excerpts, fullContent }], errors: [{ url, errorType, httpStatusCode, content }] }`.
  A URL that Parallel could not read is in `errors`. `fullContent` is
  `null` unless you pass `fullContent: true`.
- `research-start` returns `{ runId, status, processor }` at once. Its
  `output` defaults to `text`, a markdown report. `auto` returns JSON whose
  shape Parallel chooses.

## Deep research: start, then poll

A run takes from 10 seconds (`lite`) to 25 minutes (`ultra`). One
`research-get` call makes one status check and returns. It never waits for
the run.

1. Call `research-start({ input })`. Keep `runId`.
2. Wait about 30 seconds. Use the `retryAfterSeconds` value when it is
   present.
3. Call `research-get({ runId })`.
4. Act on the result:
   - `done: true` and `output` present: the run completed.
     `output.content` is the report (a string for `text`, an object for
     `auto`). `output.basis` holds the reasoning and the citations
     (`citations: [{ url, title, excerpts }]`). Cite the sources.
   - `done: false` and `retryAfterSeconds` present: go back to step 2.
   - `error` present: stop polling. Tell the user `error.message`, and
     `error.refId` when it is not `null`.
5. Stop after about 30 minutes without `done: true`. Tell the user the run
   id, so that they can check it later.

`next` repeats the step to take in plain words.

| `status` | `done` | What to do |
| --- | --- | --- |
| `queued`, `running`, `cancelling` | `false` | Poll again in about 30 s |
| `completed` with output | `true` | Read `output` |
| `completed` without output | `false` | The result is not served yet. Poll again in about 30 s |
| `failed`, `cancelled` | `true` | Stop. Report `error` |
| `action_required` | `false` | Stop. Report `error`. The user must act at `https://platform.parallel.ai` |
| any other status | `false` | Stop. Report `error` |

Do not loop on `research-get` inside one `execute` run. Each call is short,
and a loop of waits can exceed the run's time limit.

## Smoke tests

Run these from `execute`, in order. They cost about $0.007 in total. Their
deadlines add up to 75 seconds, so if one execute run times out, run each call
in its own `execute`.

```js
import search from 'kody:@danj/parallel/search'
import extract from 'kody:@danj/parallel/extract'
import researchStart from 'kody:@danj/parallel/research-start'

const found = await search({ queries: ['parallel web search api'] })
const read = await extract({ urls: ['https://docs.parallel.ai/getting-started/pricing'] })
const run = await researchStart({ input: 'What is Parallel Web Systems?', processor: 'lite' })
let refused
try {
  await researchStart({ input: 'test', processor: 'ultra2x' })
} catch (error) {
  refused = error.message
}
return { results: found.results.length, read: read.results.length, runId: run.runId, refused }
```

Expect `results` above 0, `read` equal to 1, a `runId`, and `refused` equal
to the processor error below. Then call `research-get({ runId })` in later
`execute` runs, about 30 seconds apart, until `done` is true. Expect
`output.type` to be `text` and `output.basis` to list citations.

## Errors

### Input errors

The package checks the input before any request. An invalid input throws
`@danj/parallel/<export>: <problems>`, with problems joined by `; `. Each
problem names the key, or the list index, such as `queries.1`:

| Message | Cause |
| --- | --- |
| `<key>: unknown key. Accepted keys: <keys>` | A key the export does not take |
| `processor: Expected one of: lite, base, core, core2x, pro, ultra` | A processor outside the cap, such as `ultra2x` |
| `<key>: Expected one of: <values>` | `mode` or `output` outside its values |
| `<key>: Expected string`, `Expected array`, `Expected number`, `Expected boolean` | Wrong type, or a required key is missing |
| `<key>: Expected a non-empty string` | An empty or blank string |
| `<key>: Expected at least one item` | An empty list |
| `urls: Expected at most 20 URLs` | More than 20 URLs |
| `maxCharsTotal: Expected a positive integer` | Zero, a negative number, or a fraction |
| `Expected object` | The input is not an object |

### research-start

`@danj/parallel/research-start: Parallel did not confirm the run (<cause>). A paid run may have started anyway. Check https://platform.parallel.ai before you start another.`

The request timed out, the connection failed, or Parallel answered 408 or
5xx. The package does not retry it. Do not start another run until the user
has checked.

### research-get

`research-get` returns these in `error.message`. It does not throw them.
Parallel's own message replaces any of them when Parallel sends one.

- `The run failed.`
- `The run was cancelled.`
- `The run needs an action this package cannot take. Check the run at https://platform.parallel.ai.`
- `Parallel sent a run status this package does not know.`

### Parallel errors

Any other failure throws the `parallel-web` SDK error. A reply error has a
`status` and the message `<status> <response body as JSON>`, such as
`401 {"error":{"message":"..."}}`. A connection error has the message
`Connection error.` or `Request timed out.` and no `status`.

| `status` | Meaning | What to do |
| --- | --- | --- |
| 401 | The key is missing or wrong | Send the secret link above |
| 404 | `research-get` got an unknown `runId` | Check the run id |
| 422 | Parallel refused the input | Read the message and fix the input |
| 429 | Rate limit | Wait a minute, then try again |
| 5xx | Parallel failed | Try `search`, `extract`, or `research-get` again later |

No export retries. Each call ends within its deadline, response body
included: 25 seconds for `search`, `extract`, and `research-start`, 35 seconds
for `research-get`. A call cut off by its deadline throws an error named
`TimeoutError` (for `research-start`, wrapped in the "may have started" error
above). To retry `search`, `extract`, or `research-get`, call it again.
