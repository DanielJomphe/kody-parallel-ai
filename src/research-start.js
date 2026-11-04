import { defaulted, enum_ } from '@remix-run/data-schema'

import { BUDGETS, DEADLINES, parallel } from './client.js'
import { strictInput, text } from './input.js'
import { DEFAULT_PROCESSOR, PROCESSORS } from './processors.js'

// Parallel picks auto (structured JSON) output when task_spec is absent.
const TASK_SPECS = {
  text: { output_schema: { type: 'text' } },
  auto: undefined,
}

const parseInput = strictInput('@danj/parallel/research-start', {
  input: text(),
  processor: defaulted(enum_(PROCESSORS), DEFAULT_PROCESSOR),
  output: defaulted(enum_(Object.keys(TASK_SPECS)), 'text'),
})

/**
 * Start a paid Parallel deep-research run and return its id at once.
 * Use for questions that need many sources; then poll `research-get`.
 * Processors above `ultra` are refused before any request.
 *
 * @param {{ input: string, processor?: 'lite'|'base'|'core'|'core2x'|'pro'|'ultra', output?: 'text'|'auto' }} input
 *   `input` is the research question. `processor` defaults to `pro` ($0.10).
 *   `output` defaults to `text`, a cited report; `auto` asks for JSON.
 * @returns {Promise<{ runId: string, status: string, processor: string }>}
 *
 * @example
 * import researchStart from 'kody:@danj/parallel/research-start'
 * const { runId } = await researchStart({ input: 'Compare the pricing of the main web search APIs for agents.', processor: 'lite' })
 */
export default async function researchStart(input) {
  const parsed = parseInput(input)
  let run
  try {
    run = await parallel(DEADLINES['research-start']).taskRun.create(
      { input: parsed.input, processor: parsed.processor, task_spec: TASK_SPECS[parsed.output] },
      BUDGETS.create,
    )
  } catch (error) {
    throw unconfirmed(error)
  }
  return { runId: run.run_id, status: run.status, processor: run.processor }
}

/**
 * A 4xx reply other than 408 means Parallel refused the run. Any other
 * failure leaves open whether a paid run started.
 */
function unconfirmed(error) {
  const refused = error?.status >= 400 && error.status < 500 && error.status !== 408
  if (refused) return error
  return new Error(
    `@danj/parallel/research-start: Parallel did not confirm the run (${error?.message}). ` +
      'A paid run may have started anyway. Check https://platform.parallel.ai before you start another.',
    { cause: error },
  )
}
