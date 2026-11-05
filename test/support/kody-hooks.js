import { registerHooks } from 'node:module'

const RUNTIME = new URL('./kody-runtime.js', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'kody:runtime') return { url: RUNTIME, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
