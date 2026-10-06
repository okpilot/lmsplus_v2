import { beforeEach, describe, expect, it, vi } from 'vitest'

const initSpy = vi.hoisted(() => vi.fn())

vi.mock('@sentry/nextjs', () => ({
  init: initSpy,
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
  captureRouterTransitionStart: vi.fn(),
}))

describe('Sentry init options', () => {
  beforeEach(() => {
    vi.resetModules()
    initSpy.mockClear()
  })

  it.each([
    ['client', () => import('./sentry.client.config')],
    ['server', () => import('./sentry.server.config')],
    ['edge', () => import('./sentry.edge.config')],
  ])('%s config never captures HTTP request or response bodies', async (_name, load) => {
    await load()
    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dataCollection: { httpBodies: [] } }),
    )
  })
})
