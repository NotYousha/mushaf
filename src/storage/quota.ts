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

/** Headroom check for bulk download: the mushaf plus 25% breathing room. */
export function canDownloadAll(catalogBytes: number, free: number): boolean {
  return free > catalogBytes * 1.25
}
