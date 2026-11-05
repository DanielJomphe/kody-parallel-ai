import { defaulted, enum_, object, optional } from '@remix-run/data-schema'

import { BUDGETS, DEADLINES, parallel } from './client.js'
import { mills, strictInput, text } from './input.js'
import { reserve } from './ledger.js'
import { DEFAULT_PROCESSOR, PROCESSORS, TIERS } from './processors.js'

const NAME = '@danj/parallel/research-start'

// Parallel picks auto (structured JSON) output when task_spec is absent.
const TASK_SPECS = {
  text: (description) => ({ output_schema: { type: 'text', description } }),
  auto: () => undefined,
}

const POOL = { key: text(), budgetMills: mills() }

const parseInput = strictInput(
  NAME,
  {
    input: text(),
    processor: defaulted(enum_(PROCESSORS), DEFAULT_PROCESSOR),
    output: defaulted(enum_(Object.keys(TASK_SPECS)), 'text'),
    description: optional(text()),
    fallbackProcessor: optional(enum_(PROCESSORS)),
    pool: optional(object(POOL, { unknownKeys: 'error' })),
  },
  { pool: Object.keys(POOL) },
)

function charge(processor) {
  return { kind: processor, units: TIERS[processor].mills }
}

/**
 * Start a paid Parallel deep-research run and return its id at once.
 * Use for questions that need many sources; then poll `research-get`.
 * Processors above `ultra` are refused before any request. The run's list
 * price is charged to today's budget before the request, and stays charged
 * whatever happens next. A run that does not fit throws an error with
 * `code: 'budget'` and sends nothing.
 *
 * @param {{ input: string, processor?: 'lite'|'base'|'core'|'core2x'|'pro'|'ultra', output?: 'text'|'auto', description?: string, fallbackProcessor?: 'lite'|'base'|'core'|'core2x'|'pro'|'ultra', pool?: { key: string, budgetMills: number } }} input
 *   `input` is the research question. `processor` defaults to `pro` ($0.10).
 *   `output` defaults to `text`, a cited report; `auto` asks for JSON.
 *   `description` tells Parallel how to write a `text` report.
 *   `fallbackProcessor` runs instead when `processor` does not fit the budget.
 *   `pool` also caps today's spending by every run that names the same `key`
 *   at `budgetMills` (in 0.1 ¢).
 * @returns {Promise<{ runId: string, status: string, processor: string }>}
 *   `processor` is the one charged and started.
 *
 * @example
 * import researchStart from 'kody:@danj/parallel/research-start'
 * const { runId, processor } = await researchStart({ input: 'Compare the pricing of the main web search APIs for agents.', processor: 'core', fallbackProcessor: 'lite' })
 */
export default async function researchStart(input) {
  const parsed = parseInput(input)
  if (parsed.description !== undefined && parsed.output !== 'text') {
    throw new Error(`${NAME}: description: Accepted only with output 'text'`)
  }
  const { kind: processor } = await reserve({
    ...charge(parsed.processor),
    fallback: parsed.fallbackProcessor && charge(parsed.fallbackProcessor),
    pool: parsed.pool,
  })
  let run
  try {
    run = await parallel(DEADLINES['research-start']).taskRun.create(
      { input: parsed.input, processor, task_spec: TASK_SPECS[parsed.output](parsed.description) },
      BUDGETS.create,
    )
  } catch (error) {
    throw unconfirmed(error)
  }
  return { runId: run.run_id, status: run.status, processor }
}

/**
 * A 4xx reply other than 408 means Parallel refused the run. Any other
 * failure leaves open whether a paid run started.
 */
function unconfirmed(error) {
  const refused = error?.status >= 400 && error.status < 500 && error.status !== 408
  if (refused) return error
  return new Error(
    `${NAME}: Parallel did not confirm the run (${error?.message}). ` +
      'A paid run may have started anyway. Check https://platform.parallel.ai before you start another.',
    { cause: error },
  )
}
