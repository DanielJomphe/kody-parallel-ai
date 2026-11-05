import { defaulted, enum_, optional } from '@remix-run/data-schema'

import { BUDGETS, DEADLINES, parallel } from './client.js'
import { positiveInteger, strictInput, text, texts } from './input.js'
import { reserve, SEARCH_MILLS } from './ledger.js'

const parseInput = strictInput('@danj/parallel/search', {
  queries: texts(),
  objective: optional(text()),
  mode: defaulted(enum_(['turbo', 'fast', 'basic', 'advanced']), 'fast'),
  maxCharsTotal: optional(positiveInteger()),
})

/**
 * Search the web with Parallel and get ranked pages with excerpts.
 * Use for current facts or sources. Each call is charged 5 mills ($0.005)
 * to today's budget before the request; one that does not fit throws an
 * error with `code: 'budget'` and sends nothing.
 *
 * @param {{ queries: string[], objective?: string, mode?: 'turbo'|'fast'|'basic'|'advanced', maxCharsTotal?: number }} input
 *   `queries` holds 1 or more keyword queries of 3-6 words. `objective` says
 *   the goal in plain words. `mode` defaults to `fast`. `maxCharsTotal` caps
 *   the excerpt characters across all results.
 * @returns {Promise<{ searchId: string, results: { url: string, title: string|null, publishDate: string|null, excerpts: string[] }[] }>}
 *
 * @example
 * import search from 'kody:@danj/parallel/search'
 * const { results } = await search({ queries: ['parallel web api pricing'], objective: 'What does Parallel charge per search?' })
 */
export default async function search(input) {
  const { queries, objective, mode, maxCharsTotal } = parseInput(input)
  await reserve({ kind: 'search', units: SEARCH_MILLS })
  const response = await parallel(DEADLINES.search).search(
    { search_queries: queries, objective, mode, max_chars_total: maxCharsTotal },
    BUDGETS.search,
  )
  return {
    searchId: response.search_id,
    results: response.results.map((r) => ({
      url: r.url,
      title: r.title ?? null,
      publishDate: r.publish_date ?? null,
      excerpts: r.excerpts,
    })),
  }
}
