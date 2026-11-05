import { strictInput } from './input.js'
import { CEILING_MILLS, spending } from './ledger.js'
import { TIERS } from './processors.js'

const parseInput = strictInput('@danj/parallel/research-options', {})

/**
 * List the research processors this package allows, their prices and
 * times, and today's spending against the daily budget. Free and read-only.
 * Use it to pick a processor that fits before `research-start`.
 *
 * @param {{}} [input] takes no keys
 * @returns {Promise<{ day: string, tiers: { processor: string, mills: number, shortestSeconds: number, longestSeconds: number }[], spentMills: number, pools: Record<string, number>, budgetMills: number, ceilingMills: number }>}
 *   Money is in mills (0.1 ¢). `day` is today in America/Toronto. `tiers`
 *   runs cheapest first. `spentMills` counts every paid call today, and
 *   `pools` the runs that named each pool key. `budgetMills` is the
 *   effective daily budget, at most `ceilingMills`.
 *
 * @example
 * import researchOptions from 'kody:@danj/parallel/research-options'
 * const { tiers, spentMills, budgetMills } = await researchOptions({})
 * const affordable = tiers.filter((tier) => spentMills + tier.mills <= budgetMills)
 */
export default async function researchOptions(input = {}) {
  parseInput(input)
  const { day, spentMills, pools, budgetMills } = await spending()
  return {
    day,
    tiers: Object.entries(TIERS).map(([processor, tier]) => ({ processor, ...tier })),
    spentMills,
    pools,
    budgetMills,
    ceilingMills: CEILING_MILLS,
  }
}
