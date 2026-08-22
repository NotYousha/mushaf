export async function getQuota() {
  const st = (navigator as unknown as { storage?: StorageManager })?.storage
  if (!st?.estimate) return { usage: 0, quota: 0, free: 0 }
  const { usage = 0, quota = 0 } = await st.estimate()
  return { usage, quota, free: Math.max(0, quota - usage) }
}

export async function requestPersistence(): Promise<boolean> {
  const st = (navigator as unknown as { storage?: StorageManager })?.storage
  if (!st?.persist) return false
  try {
    return await st.persist()
  } catch {
    return false
  }
}

/**
 * Advisory headroom check for bulk download: the mushaf plus 25% breathing
 * room.
 *
 * This can only ever be a hint. `estimate()` reports the allowance the
 * browser grants this origin, which Chrome derives from total disk capacity
 * rather than from what is actually free, so the check can pass on a nearly
 * full phone. Nothing on the web can read real free space. The download
 * therefore treats a quota failure at write time as the authority — see
 * OutOfSpaceError — and this function only exists to warn before starting a
 * download that clearly will not fit.
 */
export function canDownloadAll(catalogBytes: number, free: number): boolean {
  return free > catalogBytes * 1.25
}
