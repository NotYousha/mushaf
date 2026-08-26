/**
 * Whether an arrival at the landing page should be sent to the app instead.
 *
 * Split out as a pure function because the interesting case cannot be
 * reproduced in a browser on purpose: it is what happens to someone who
 * installed the app before it moved to /app/, whose start_url still points at
 * the landing page, and who would otherwise launch their installed mushaf and
 * be shown an advert for it.
 */

export const APP_PATH = 'app/'

/** Written once the app has actually been opened. Read here synchronously. */
export const USED_KEY = 'mushaf:used'

export function shouldEnterApp(env: { standalone: boolean; hasUsedApp: boolean }): boolean {
  return env.standalone || env.hasUsedApp
}
