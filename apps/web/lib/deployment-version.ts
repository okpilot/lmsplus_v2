const LIVE_SESSION_PREFIX = '/app/quiz/session'

export function isLiveSessionPath(pathname: string): boolean {
  return pathname.startsWith(LIVE_SESSION_PREFIX)
}

export async function fetchDeploymentVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const version = (body as { version?: unknown } | null)?.version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

type PollingOptions = {
  isSuppressed: () => boolean
  onNewVersion: () => void
  intervalMs: number
}

export function startVersionPolling(opts: PollingOptions): () => void {
  let baseline: string | null = null
  let stopped = false

  async function check() {
    if (stopped || document.visibilityState !== 'visible' || opts.isSuppressed()) return
    const latest = await fetchDeploymentVersion()
    if (stopped || !latest || opts.isSuppressed()) return
    if (baseline === null) {
      // A late baseline may already be the new version; accepted.
      baseline = latest
      return
    }
    if (latest !== baseline) opts.onNewVersion()
  }
  const run = () => {
    void check()
  }

  void fetchDeploymentVersion().then((version) => {
    if (!stopped && baseline === null) baseline = version
  })
  const timer = setInterval(run, opts.intervalMs)
  document.addEventListener('visibilitychange', run)

  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', run)
  }
}
