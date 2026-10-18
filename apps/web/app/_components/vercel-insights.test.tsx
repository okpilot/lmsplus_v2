import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

type Event = { type: string; url: string }
type BeforeSend = (event: Event) => Event | null

const { captured } = vi.hoisted(() => ({
  captured: {} as Record<string, BeforeSend | undefined>,
}))

vi.mock('@vercel/analytics/react', () => ({
  Analytics: (props: { beforeSend?: BeforeSend }) => {
    captured.analytics = props.beforeSend
    return null
  },
}))
vi.mock('@vercel/speed-insights/react', () => ({
  SpeedInsights: (props: { beforeSend?: BeforeSend }) => {
    captured.speedInsights = props.beforeSend
    return null
  },
}))

import { VercelInsights } from './vercel-insights'

const TOKEN_URL = 'https://x.test/auth/set-password?token_hash=secret&type=recovery'
const PLAIN_URL = 'https://x.test/app/dashboard?x=1'

describe.each(['analytics', 'speedInsights'])('VercelInsights %s beforeSend', (key) => {
  function run(url: string) {
    render(<VercelInsights />)
    const fn = captured[key]
    expect(fn).toBeTypeOf('function')
    return (fn as BeforeSend)({ type: 'pageview', url })
  }

  it('removes the one-time token from the reported url and keeps other params', () => {
    const result = run(TOKEN_URL)
    expect(result?.url).not.toContain('secret')
    expect(result?.url).toContain('type=recovery')
  })

  it('leaves urls without a token unchanged', () => {
    expect(run(PLAIN_URL)).toEqual({ type: 'pageview', url: PLAIN_URL })
  })
})
