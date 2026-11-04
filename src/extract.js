import { boolean, defaulted, optional } from '@remix-run/data-schema'

import { BUDGETS, parallel } from './client.js'
import { positiveInteger, strictInput, text, texts } from './input.js'

const MAX_URLS = 20

const parseInput = strictInput('@danj/parallel/extract', {
  urls: texts().refine((urls) => urls.length <= MAX_URLS, `Expected at most ${MAX_URLS} URLs`),
  objective: optional(text()),
  queries: optional(texts()),
  fullContent: defaulted(boolean(), false),
  maxCharsTotal: optional(positiveInteger()),
})

/**
 * Read known web pages with Parallel and get excerpts or full page text.
 * Use when you already have the URLs; for finding pages, use `search`.
 *
 * @param {{ urls: string[], objective?: string, queries?: string[], fullContent?: boolean, maxCharsTotal?: number }} input
 *   `urls` holds 1 to 20 URLs. `objective` and `queries` focus the excerpts.
 *   `fullContent: true` also returns each page as markdown. `maxCharsTotal`
 *   caps the excerpt characters across all pages.
 * @returns {Promise<{ extractId: string, results: { url: string, title: string|null, publishDate: string|null, excerpts: string[], fullContent: string|null }[], errors: { url: string, errorType: string, httpStatusCode: number|null, content: string|null }[] }>}
 *   A URL that Parallel could not read is in `errors`, not in `results`.
 *
 * @example
 * import extract from 'kody:@danj/parallel/extract'
 * const { results, errors } = await extract({ urls: ['https://docs.parallel.ai/getting-started/pricing'], objective: 'What does the Search API cost?' })
 */
export default async function extract(input) {
  const { urls, objective, queries, fullContent, maxCharsTotal } = parseInput(input)
  const response = await parallel().extract(
    {
      urls,
      objective,
      search_queries: queries,
      max_chars_total: maxCharsTotal,
      advanced_settings: { full_content: fullContent },
    },
    BUDGETS.extract,
  )
  return {
    extractId: response.extract_id,
    results: response.results.map((r) => ({
      url: r.url,
      title: r.title ?? null,
      publishDate: r.publish_date ?? null,
      excerpts: r.excerpts,
      fullContent: r.full_content ?? null,
    })),
    errors: response.errors.map((e) => ({
      url: e.url,
      errorType: e.error_type,
      httpStatusCode: e.http_status_code ?? null,
      content: e.content ?? null,
    })),
  }
}
