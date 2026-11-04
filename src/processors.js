/**
 * Parallel task processors this package may start, cheapest first.
 * The list is the spending cap: `ultra2x`, `ultra4x`, and `ultra8x` are
 * absent, so input validation refuses them before any request.
 */
export const PROCESSORS = ['lite', 'base', 'core', 'core2x', 'pro', 'ultra']

export const DEFAULT_PROCESSOR = 'pro'
