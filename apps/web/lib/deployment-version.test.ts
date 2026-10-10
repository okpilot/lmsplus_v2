import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDeploymentVersion,
  isLiveSessionPath,
  startVersionPolling,
} from './deployment-version'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

describe('isLiveSessionPath', () => {
  it('treats the quiz session route and its children as live', () => {
    expect(isLiveSessionPath('/app/quiz/session')).toBe(true)
    expect(isLiveSessionPath('/app/quiz/session/abc')).toBe(true)
  })

  it('treats other routes as not live', () => {
    expect(isLiveSessionPath('/app/quiz')).toBe(false)
    expect(isLiveSessionPath('/app/dashboard')).toBe(false)
  })
})

describe('fetchDeploymentVersion', () => {
  it('returns the version string from the endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ version: 'dpl_1' }) })
    expect(await fetchDeploymentVersion()).toBe('dpl_1')
    expect(mockFetch).toHaveBeenCalledWith('/api/version', { cache: 'no-store' })
  })

  it('returns null when the response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ version: 'dpl_1' }) })
    expect(await fetchDeploymentVersion()).toBeNull()
  })

  it('returns null when the version is not a string', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ version: null }) })
    expect(await fetchDeploymentVersion()).toBeNull()
  })

  it('returns null when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    expect(await fetchDeploymentVersion()).toBeNull()
  })

  it('returns null when the body is not json', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('bad json')
      },
    })
    expect(await fetchDeploymentVersion()).toBeNull()
  })
})

describe('startVersionPolling', () => {
  const INTERVAL = 1000
  let suppressed: boolean
  const onNewVersion = vi.fn()

  function respond(version: string | null) {
    mockFetch.mockResolvedValue({ ok: version !== null, json: async () => ({ version }) })
  }

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms)
  }

  function start() {
    return startVersionPolling({
      isSuppressed: () => suppressed,
      onNewVersion,
      intervalMs: INTERVAL,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    suppressed = false
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('reports a new version once the polled id differs from the baseline', async () => {
    respond('v1')
    const stop = start()
    await advance(0)
    respond('v2')
    await advance(INTERVAL)
    expect(onNewVersion).toHaveBeenCalledOnce()
    stop()
  })

  it('reports a new version when the tab runs an older build than the server, even while suppressed at load', async () => {
    vi.stubEnv('NEXT_DEPLOYMENT_ID', 'dpl_A')
    respond('dpl_B')
    suppressed = true
    const stop = start()
    await advance(INTERVAL)
    suppressed = false
    await advance(INTERVAL)
    expect(onNewVersion).toHaveBeenCalledOnce()
    stop()
  })

  it('takes the baseline from the build id without fetching it', async () => {
    vi.stubEnv('NEXT_DEPLOYMENT_ID', 'dpl_A')
    respond('dpl_A')
    const stop = start()
    await advance(0)
    expect(mockFetch).not.toHaveBeenCalled()
    stop()
  })

  it('falls back to fetching the baseline when the build id is empty', async () => {
    vi.stubEnv('NEXT_DEPLOYMENT_ID', '')
    respond('v1')
    const stop = start()
    await advance(0)
    expect(mockFetch).toHaveBeenCalledOnce()
    stop()
  })

  it('stays silent while the polled id equals the baseline', async () => {
    respond('v1')
    const stop = start()
    await advance(INTERVAL * 3)
    expect(onNewVersion).not.toHaveBeenCalled()
    stop()
  })

  it('takes the baseline from a later poll when the first fetch fails', async () => {
    respond(null)
    const stop = start()
    await advance(0)
    respond('v1')
    await advance(INTERVAL)
    expect(onNewVersion).not.toHaveBeenCalled()
    respond('v2')
    await advance(INTERVAL)
    expect(onNewVersion).toHaveBeenCalledOnce()
    stop()
  })

  it('does not report when suppression starts during the in-flight fetch', async () => {
    respond('v1')
    const stop = start()
    await advance(0)
    let release: (value: unknown) => void = () => {}
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    await advance(INTERVAL)
    suppressed = true
    release({ ok: true, json: async () => ({ version: 'v2' }) })
    await advance(0)
    expect(onNewVersion).not.toHaveBeenCalled()
    stop()
  })

  it('does not fetch on a poll while the tab is hidden', async () => {
    respond('v1')
    const stop = start()
    await advance(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mockFetch.mockClear()
    await advance(INTERVAL * 2)
    expect(mockFetch).not.toHaveBeenCalled()
    stop()
  })

  it('checks immediately when the tab becomes visible', async () => {
    respond('v1')
    const stop = start()
    await advance(0)
    respond('v2')
    document.dispatchEvent(new Event('visibilitychange'))
    await advance(0)
    expect(onNewVersion).toHaveBeenCalledOnce()
    stop()
  })

  it('sends one version request when the tab refocuses during a pending check', async () => {
    respond('v1')
    const stop = start()
    try {
      await advance(0)
      let release: (value: unknown) => void = () => {}
      mockFetch.mockReset()
      mockFetch.mockReturnValue(
        new Promise((resolve) => {
          release = resolve
        }),
      )
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
      await advance(0)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      release({ ok: true, json: async () => ({ version: 'v1' }) })
      await advance(0)
      respond('v2')
      await advance(INTERVAL)
      expect(onNewVersion).toHaveBeenCalledOnce()
    } finally {
      stop()
    }
  })

  it('checks for a new version when the window regains focus', async () => {
    respond('v1')
    const stop = start()
    try {
      await advance(0)
      respond('v2')
      window.dispatchEvent(new Event('focus'))
      await advance(0)
      expect(onNewVersion).toHaveBeenCalledOnce()
    } finally {
      stop()
    }
  })

  it('stops fetching after cleanup', async () => {
    respond('v1')
    const stop = start()
    await advance(0)
    stop()
    mockFetch.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await advance(INTERVAL * 3)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
