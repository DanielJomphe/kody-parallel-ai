export const TIERS = {
  lite: { mills: 5, shortestSeconds: 5, longestSeconds: 60 },
  base: { mills: 10, shortestSeconds: 15, longestSeconds: 100 },
  core: { mills: 25, shortestSeconds: 60, longestSeconds: 300 },
  core2x: { mills: 50, shortestSeconds: 120, longestSeconds: 300 },
  pro: { mills: 100, shortestSeconds: 180, longestSeconds: 540 },
  ultra: { mills: 300, shortestSeconds: 300, longestSeconds: 1500 },
}

export const PROCESSORS = Object.keys(TIERS)

export const DEFAULT_PROCESSOR = 'pro'
