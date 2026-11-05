export function packageStorage() {
  if (!globalThis.kodyStorage) throw new Error('test did not call stubStorage()')
  return globalThis.kodyStorage
}
