import { packageStorage } from 'kody:runtime'

export const CEILING_MILLS = 1000

export const SEARCH_MILLS = 5
export const EXTRACT_MILLS_PER_URL = 1

const KEEP_DAYS = 40
const DAY_MS = 86_400_000

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS spend (id INTEGER PRIMARY KEY, day TEXT, pool TEXT NULL, kind TEXT, units INTEGER, at TEXT)',
  'CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT)',
]

const RESERVE = `INSERT INTO spend (day, pool, kind, units, at)
SELECT ?1, ?2, CASE WHEN ok1 THEN ?3 ELSE ?5 END, CASE WHEN ok1 THEN ?4 ELSE ?6 END, ?7
FROM (SELECT
  (day_sum + ?4 <= cap AND (?2 IS NULL OR pool_sum + ?4 <= ?9)) AS ok1,
  (day_sum + ?6 <= cap AND (?2 IS NULL OR pool_sum + ?6 <= ?9)) AS ok2
  FROM (SELECT
    COALESCE((SELECT SUM(units) FROM spend WHERE day = ?1), 0) AS day_sum,
    COALESCE((SELECT SUM(units) FROM spend WHERE day = ?1 AND pool = ?2), 0) AS pool_sum,
    MIN(COALESCE((SELECT CAST(v AS INTEGER) FROM config WHERE k = 'budget'), 500), ?8) AS cap))
WHERE ok1 OR ok2
RETURNING id, kind, units;`

const BUDGET = `SELECT MIN(COALESCE((SELECT CAST(v AS INTEGER) FROM config WHERE k = 'budget'), 500), ?) AS budget`

const TORONTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function torontoDay(now = new Date()) {
  const part = Object.fromEntries(TORONTO.formatToParts(now).map(({ type, value }) => [type, value]))
  return `${part.year}-${part.month}-${part.day}`
}

function daysBefore(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - count * DAY_MS).toISOString().slice(0, 10)
}

async function sql(query, params = []) {
  const { rows } = await packageStorage().sql(query, params)
  return rows
}

async function ensureTables() {
  for (const statement of SCHEMA) await sql(statement)
}

export async function reserve({ kind, units, fallback = { kind, units }, pool }) {
  await ensureTables()
  const now = new Date()
  const day = torontoDay(now)
  await sql('DELETE FROM spend WHERE day < ?', [daysBefore(day, KEEP_DAYS)])
  const [row] = await sql(RESERVE, [
    day,
    pool?.key ?? null,
    kind,
    units,
    fallback.kind,
    fallback.units,
    now.toISOString(),
    CEILING_MILLS,
    pool?.budgetMills ?? null,
  ])
  if (!row) throw Object.assign(new Error('@danj/parallel/budget: daily budget reached'), { code: 'budget' })
  return { kind: row.kind, units: row.units }
}

export async function spending() {
  await ensureTables()
  const day = torontoDay()
  const sums = await sql('SELECT pool, SUM(units) AS mills FROM spend WHERE day = ? GROUP BY pool', [day])
  const [{ budget }] = await sql(BUDGET, [CEILING_MILLS])
  return {
    day,
    spentMills: sums.reduce((total, { mills }) => total + mills, 0),
    pools: Object.fromEntries(sums.filter(({ pool }) => pool !== null).map(({ pool, mills }) => [pool, mills])),
    budgetMills: budget,
  }
}

export async function storeBudget(budgetMills) {
  await ensureTables()
  const stored = Math.min(budgetMills, CEILING_MILLS)
  await sql("INSERT INTO config (k, v) VALUES ('budget', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", [
    String(stored),
  ])
  return stored
}
