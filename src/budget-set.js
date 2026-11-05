import { mills, strictInput } from './input.js'
import { storeBudget } from './ledger.js'

const parseInput = strictInput('@danj/parallel/budget-set', { budgetMills: mills() })

/**
 * Set the daily budget for every paid call through this package: search,
 * extract, and research. For the owner, from `execute`; other packages
 * must not call it. A value above the 1000-mill ($1.00) ceiling is stored
 * as the ceiling.
 *
 * @param {{ budgetMills: number }} input the budget in mills (0.1 ¢), an integer of at least 0
 * @returns {Promise<{ budgetMills: number }>} the budget now in effect
 *
 * @example
 * import budgetSet from 'kody:@danj/parallel/budget-set'
 * await budgetSet({ budgetMills: 500 }) // $0.50 a day
 */
export default async function budgetSet(input) {
  const { budgetMills } = parseInput(input)
  return { budgetMills: await storeBudget(budgetMills) }
}
