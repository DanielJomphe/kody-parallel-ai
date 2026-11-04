import { array, number, object, parseSafe, string } from '@remix-run/data-schema'

export const text = () => string().refine((s) => s.trim() !== '', 'Expected a non-empty string')

export const texts = () => array(text()).refine((a) => a.length > 0, 'Expected at least one item')

export const positiveInteger = () =>
  number().refine((n) => Number.isInteger(n) && n > 0, 'Expected a positive integer')

/**
 * Build a parser for one export's input that rejects unknown keys.
 * Errors name the export, the path, and for an unknown key the accepted keys.
 *
 * @param {string} exportName such as `@danj/parallel/search`
 * @param {Record<string, import('@remix-run/data-schema').Schema<any, any>>} shape
 * @returns {(value: unknown) => any}
 */
export function strictInput(exportName, shape) {
  const schema = object(shape, { unknownKeys: 'error' })
  const accepted = Object.keys(shape).join(', ')
  const errorMap = ({ code }) =>
    code === 'object.unknown_key' ? `unknown key. Accepted keys: ${accepted}` : undefined
  return (value) => {
    const result = parseSafe(schema, value, { errorMap })
    if (result.success) return result.value
    const problems = result.issues.map(({ path = [], message }) =>
      path.length ? `${path.join('.')}: ${message}` : message,
    )
    throw new Error(`${exportName}: ${problems.join('; ')}`)
  }
}
