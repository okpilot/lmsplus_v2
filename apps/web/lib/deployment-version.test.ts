import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissNewVersionToast,
  fetchDeploymentVersion,
  isLiveSessionPath,
  NEW_VERSION_TOAST_ID,
  showNewVersionToast,
} from './deployment-version'

const { mockToast, mockDismiss } = vi.hoisted(() => {
  const dismiss = vi.fn()
  const toast = Object.assign(vi.fn(), { dismiss })
  return { mockToast: toast, mockDismiss: dismiss }
})

vi.mock('sonner', () => ({ toast: mockToast }))

const mockFetch = vi.fn()

type ToastOptions = {
  id: string
  duration: number
  action: { label: string; onClick: () => void }
}

function lastToastCall(): [string, ToastOptions] {
  return mockToast.mock.calls[0] as [string, ToastOptions]
}

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

describe('new version toast', () => {
  it('shows a persistent toast with a Reload action', () => {
    showNewVersionToast()
    expect(mockToast).toHaveBeenCalledOnce()
    const [message, options] = lastToastCall()
    expect(message).toBe('A new version is available')
    expect(options.id).toBe(NEW_VERSION_TOAST_ID)
    expect(options.duration).toBe(Number.POSITIVE_INFINITY)
    expect(options.action.label).toBe('Reload')
  })

  it('reloads the page when Reload is clicked', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    showNewVersionToast()
    lastToastCall()[1].action.onClick()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('dismisses the toast by id', () => {
    dismissNewVersionToast()
    expect(mockDismiss).toHaveBeenCalledWith(NEW_VERSION_TOAST_ID)
  })
})
