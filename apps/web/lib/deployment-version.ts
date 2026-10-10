export const LIVE_SESSION_PREFIX = '/app/quiz/session'

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

type VersionCheck = {
  check: () => Promise<void>
  seedBaseline: (version: string | null) => void
}

function createVersionCheck(opts: PollingOptions, isStopped: () => boolean): VersionCheck {
  let baseline: string | null = null
  let inFlight = false

  async function check() {
    if (inFlight || isStopped() || document.visibilityState !== 'visible' || opts.isSuppressed()) {
      return
    }
    inFlight = true
    try {
      const latest = await fetchDeploymentVersion()
      if (isStopped() || !latest || opts.isSuppressed()) return
      if (baseline === null) {
        // Fallback without a build id: a late baseline may already be the new version; accepted.
        baseline = latest
        return
      }
      if (latest !== baseline) opts.onNewVersion()
    } finally {
      inFlight = false
    }
  }
  const seedBaseline = (version: string | null) => {
    if (!isStopped() && baseline === null) baseline = version
  }
  return { check, seedBaseline }
}

export function startVersionPolling(opts: PollingOptions): () => void {
  let stopped = false
  const { check, seedBaseline } = createVersionCheck(opts, () => stopped)
  const run = () => {
    void check()
  }

  // The build this tab runs; Next inlines it on Vercel (the literal must stay `process.env.NEXT_DEPLOYMENT_ID`).
  const ownBuild = process.env.NEXT_DEPLOYMENT_ID
  if (ownBuild) seedBaseline(ownBuild)
  else void fetchDeploymentVersion().then(seedBaseline)
  const timer = setInterval(run, opts.intervalMs)
  document.addEventListener('visibilitychange', run)
  window.addEventListener('focus', run)

  return () => {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', run)
    window.removeEventListener('focus', run)
  }
}
