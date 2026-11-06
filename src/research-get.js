import { BUDGETS, DEADLINES, parallel } from './client.js'
import { strictInput, text } from './input.js'

const POLL_SECONDS = 30
const POLL = {
  done: false,
  retryAfterSeconds: POLL_SECONDS,
  next: `Call research-get again in about ${POLL_SECONDS} seconds.`,
}
const STOP = 'Stop polling and tell the user.'

/**
 * What a caller does for each Parallel run status. An `error` entry is the
 * fallback message when Parallel sends no error of its own.
 */
const OUTCOMES = {
  queued: POLL,
  running: POLL,
  cancelling: POLL,
  completed: { done: true, next: 'Read output. output.basis holds the citations.' },
  failed: { done: true, next: STOP, error: 'The run failed.' },
  cancelled: { done: true, next: STOP, error: 'The run was cancelled.' },
  action_required: {
    done: false,
    next: STOP,
    error: 'The run needs an action this package cannot take. Check the run at https://platform.parallel.ai.',
  },
}
const UNKNOWN = { done: false, next: STOP, error: 'Parallel sent a run status this package does not know.' }
// Parallel can mark a run completed a moment before its result is served.
const RESULT_PENDING = { ...POLL, next: `The result is not ready yet. ${POLL.next}` }

const RESULT_WAIT_SECONDS = 10

const parseInput = strictInput('@danj/parallel/research-get', { runId: text() })

/**
 * Check a deep-research run from `research-start` and, once done, get its report.
 * Use every ~30 s until `done` is true or `next` says to stop polling.
 *
 * @param {{ runId: string }} input
 * @returns {Promise<{ runId: string, status: string, processor: string, createdAt: string|null, modifiedAt: string|null, done: boolean, next: string, retryAfterSeconds?: number, output?: { type: 'text'|'json', content: unknown, basis: unknown[] }, error?: { message: string, refId: string|null } }>}
 *   `output.content` is a string for text runs and an object for auto runs.
 *
 * @example
 * import researchGet from 'kody:@danj/parallel/research-get'
 * const run = await researchGet({ runId: 'trun_123' })
 * if (run.done && run.output) console.log(run.output.content)
 */
export default async function researchGet(input) {
  const { runId } = parseInput(input)
  const client = parallel(DEADLINES['research-get'])
  const run = await client.taskRun.retrieve(runId, BUDGETS.retrieve)
  const outcome = OUTCOMES[run.status] ?? UNKNOWN
  if (run.status !== 'completed') return project(run, outcome)
  try {
    const { output } = await client.taskRun.result(
      runId,
      { timeout: RESULT_WAIT_SECONDS },
      BUDGETS.result,
    )
    return {
      ...project(run, outcome),
      output: { type: output.type, content: output.content, basis: output.basis },
    }
  } catch (error) {
    if (error?.status === 408) return project(run, RESULT_PENDING)
    throw error
  }
}

function project(run, { error, ...outcome }) {
  return {
    runId: run.run_id,
    status: run.status,
    processor: run.processor,
    createdAt: run.created_at ?? null,
    modifiedAt: run.modified_at ?? null,
    ...outcome,
    ...(error && {
      error: { message: run.error?.message ?? error, refId: run.error?.ref_id ?? null },
    }),
  }
}
