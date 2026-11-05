# @danj/parallel

## Intent

Let your agents search the web, read web pages, and run deep research with
[Parallel](https://parallel.ai), without ever holding your Parallel API key.
The key lives in Kody as the secret `parallel-api-key`. Kody adds it to each
request to `api.parallel.ai`.

It calls Parallel through
[`parallel-web`](https://www.npmjs.com/package/parallel-web), Parallel's
official TypeScript SDK. It is not made or endorsed by Parallel.

Deep research costs money per run, so the package caps it. It starts runs
on the processors `lite` to `ultra` only. It refuses `ultra2x`, `ultra4x`,
and `ultra8x` before it sends any request. The cap is a setting: a fork can
raise or lower it, as "Raise or lower the cap" below explains.

Every paid call also counts against a daily budget, $0.50 unless you change
it, and never more than $1.00. A call that would pass the budget is refused
before it reaches Parallel. "Daily budget" below explains it.

## What you can ask your agent

- "Search the web for this week's news on the EU AI Act."
- "Read these three pages and tell me what each says about pricing."
- "Research the main web search APIs for agents and compare their prices.
  Use the `lite` processor." The agent starts a run, checks it every 30
  seconds or so, and gives you the report with its sources.

## What it does

| Export | Does | Cost per call | Counts against the budget |
| --- | --- | --- | --- |
| `search` | Searches the web. Returns pages with excerpts. | $0.001 in `turbo` or `fast` mode (the default), $0.005 in `basic` or `advanced` | $0.005 |
| `extract` | Reads 1 to 20 URLs. Returns excerpts, and the full page text on request. | $0.001 per URL | $0.001 per URL |
| `research-start` | Starts a deep-research run. Returns its run id at once. | See the processor table | The processor's cost |
| `research-get` | Checks a run. When it is done, returns the report and its citations. | Free | Nothing |
| `research-options` | Lists the allowed processors with their costs and times, and today's spending. | Free | Nothing |
| `budget-set` | Sets the daily budget. | Free | Nothing |

Deep research runs on a processor. A slower processor reads more sources.
Parallel bills a run only when it completes.

| Processor | Cost per run | Typical time |
| --- | --- | --- |
| `lite` | $0.005 | 5 to 60 s |
| `base` | $0.01 | 15 to 100 s |
| `core` | $0.025 | 1 to 5 min |
| `core2x` | $0.05 | 2 to 5 min |
| `pro` (default) | $0.10 | 3 to 9 min |
| `ultra` (the cap) | $0.30 | 5 to 25 min |

Prices and times come from Parallel's
[pricing](https://docs.parallel.ai/getting-started/pricing) and
[processor](https://docs.parallel.ai/task-api/guides/choose-a-processor)
pages: prices on 2026-11-04, times from the Task API rate table on 2026-11-05.
Times exclude queueing. `research-options` returns the same times.

## Set it up

1. Create an API key at [platform.parallel.ai](https://platform.parallel.ai).
2. Open the
   [Kody secret page for `parallel-api-key`](https://kody.codes/connect/secret-set?name=parallel-api-key&description=Parallel%20API%20key&allowedHosts=api.parallel.ai)
   and paste the key. The link limits the secret to `api.parallel.ai`.
3. Ask your agent to run a search. If it returns results, the key works.

Your key never passes through the agent. Never paste it into a chat.

## Daily budget

The package keeps a ledger in its Kody storage. Before each paid call, it
adds the call's cost from the table above to today's total. If the new total
would pass the budget, the call throws an error whose `code` is `'budget'`,
and nothing reaches Parallel. A day is a calendar day in Toronto time, so the
total starts again at midnight there.

The ledger counts each call when it starts, at the cost above, and never gives
it back. That holds when Parallel fails the run or bills less. For example, a
`fast` search counts $0.005, although Parallel bills $0.001 for it. The cap is
therefore on what calls could cost, which can be more than Parallel bills.

The budget is $0.50 a day until you change it. It can never pass the ceiling
of $1.00, which only a new version of the package can change. To change the
budget, ask your agent to run this from Kody `execute`, with your amount in
tenths of a cent (500 is $0.50):

```js
import budgetSet from 'kody:@danj/parallel/budget-set'

return await budgetSet({ budgetMills: 500 })
```

It returns the budget now in effect. A value above 1000 sets the budget to
1000. To see today's spending, run `research-options`:

```js
import researchOptions from 'kody:@danj/parallel/research-options'

return await researchOptions({})
```

A program that starts research on its own, such as a mail handler, can also
give each run a `pool`: a name and a smaller daily budget of its own. The
daily budget still applies on top. A program can also name a cheaper
`fallbackProcessor` to use when the one it asked for does not fit.

The ledger keeps every call. It counts only calls made through this
package, version 1.1 or later, by your Kody account. Code that calls
`api.parallel.ai` directly with the same secret is not counted.

## Raise or lower the cap

Fork the package to change the cap. The cap is the table `TIERS` in
`src/processors.js`. To allow `ultra2x`, add it to the end of the table with
its cost in tenths of a cent and its usual times, then publish your fork. To
lower the cap, remove processors from the end. `DEFAULT_PROCESSOR` in the
same file must stay in the table. The ceiling is `CEILING_MILLS` in
`src/ledger.js`.

The cap covers this package only. Code that calls `api.parallel.ai` directly
with the same secret is not capped.

## Development

```bash
npm install
npm test
```

The tests replace `fetch` with a stub and Kody storage with an in-memory
SQLite database from `node:sqlite` and load through `module.registerHooks`,
so they need Node 22.15 or later. They
make no network calls.

## License

MIT. See the `LICENSE` file.
