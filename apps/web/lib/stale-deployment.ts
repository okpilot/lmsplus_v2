import { isLiveSessionPath } from './deployment-version'

const STALE_MESSAGE =
  /module factory is not available|Loading chunk .+ failed|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed/i
const RELOAD_KEY = 'lmsplus:stale-reload-at'
const RELOAD_COOLDOWN_MS = 60_000

export function isStaleDeploymentError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'ChunkLoadError') return true
  return typeof message === 'string' && STALE_MESSAGE.test(message)
}

export function reloadOnceForStaleDeployment(): boolean {
  if (isLiveSessionPath(window.location.pathname)) return false
  if (!window.navigator.onLine) return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY))
    if (last && Date.now() - last < RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
