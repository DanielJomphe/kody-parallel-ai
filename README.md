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

## What you can ask your agent

- "Search the web for this week's news on the EU AI Act."
- "Read these three pages and tell me what each says about pricing."
- "Research the main web search APIs for agents and compare their prices.
  Use the `lite` processor." The agent starts a run, checks it every 30
  seconds or so, and gives you the report with its sources.

## What it does

| Export | Does | Cost per call |
| --- | --- | --- |
| `search` | Searches the web. Returns pages with excerpts. | $0.001 in `turbo` or `fast` mode (the default), $0.005 in `basic` or `advanced` |
| `extract` | Reads 1 to 20 URLs. Returns excerpts, and the full page text on request. | $0.001 per URL |
| `research-start` | Starts a deep-research run. Returns its run id at once. | See the processor table |
| `research-get` | Checks a run. When it is done, returns the report and its citations. | Free |

Deep research runs on a processor. A slower processor reads more sources.
Parallel bills a run only when it completes.

| Processor | Cost per run | Typical time |
| --- | --- | --- |
| `lite` | $0.005 | 10 s to 2 min |
| `base` | $0.01 | 15 s to 3 min |
| `core` | $0.025 | 1 to 5 min |
| `core2x` | $0.05 | 1 to 10 min |
| `pro` (default) | $0.10 | 2 to 10 min |
| `ultra` (the cap) | $0.30 | 3 to 25 min |

Prices and times come from Parallel's
[pricing](https://docs.parallel.ai/getting-started/pricing) and
[processor](https://docs.parallel.ai/task-api/guides/choose-a-processor)
pages on 2026-11-04. Times exclude queueing.

## Set it up

1. Create an API key at [platform.parallel.ai](https://platform.parallel.ai).
2. Open the
   [Kody secret page for `parallel-api-key`](https://kody.codes/connect/secret-set?name=parallel-api-key&description=Parallel%20API%20key&allowedHosts=api.parallel.ai)
   and paste the key. The link limits the secret to `api.parallel.ai`.
3. Ask your agent to run a search. If it returns results, the key works.

Your key never passes through the agent. Never paste it into a chat.

## Raise or lower the cap

Fork the package to change the cap. The cap is the list `PROCESSORS` in
`src/processors.js`. To allow `ultra2x`, add it to the end of the list, then
publish your fork. To lower the cap, remove processors from the end. `DEFAULT_PROCESSOR` in the same file
must stay in the list.

The cap covers this package only. Code that calls `api.parallel.ai` directly
with the same secret is not capped.

## Development

```bash
npm install
npm test
```

The tests replace `fetch` with a stub. They make no network calls.

## License

MIT. See the `LICENSE` file.
