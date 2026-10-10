import type { User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncDeploymentPin } from './deployment-pin'

const DEPLOYMENT_ID = 'dpl_test_abc123'
const USER = { id: 'user-1' } as User
const SESSION_PATH = '/app/quiz/session/sess-1'

function run(opts: { pathname: string; user?: User | null; pin?: string; action?: boolean }) {
  const url = new URL(opts.pathname, 'http://localhost:3000')
  const request = opts.action
    ? new NextRequest(url, { method: 'POST', headers: { 'next-action': 'abc' } })
    : new NextRequest(url)
  if (opts.pin) request.cookies.set('__vdpl', opts.pin)
  const response = NextResponse.next()
  syncDeploymentPin({
    pathname: opts.pathname,
    user: opts.user === undefined ? USER : opts.user,
    request,
    response,
  })
  return response
}

describe('deployment pin cookie', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.VERCEL_DEPLOYMENT_ID
    process.env.VERCEL_DEPLOYMENT_ID = DEPLOYMENT_ID
  })

  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
    else process.env.VERCEL_DEPLOYMENT_ID = original
  })

  it('pins a signed-in user on a quiz session page, scoped to session pages for 8 hours', () => {
    const cookie = run({ pathname: SESSION_PATH }).cookies.get('__vdpl')
    expect(cookie).toMatchObject({
      name: '__vdpl',
      value: DEPLOYMENT_ID,
      path: '/app/quiz/session',
      maxAge: 28800,
      httpOnly: true,
      sameSite: 'strict',
    })
  })

  it('keeps the existing pin when the request already carries one', () => {
    expect(run({ pathname: SESSION_PATH, pin: 'dpl_old' }).headers.get('set-cookie')).toBeNull()
  })

  it('does not pin a signed-out user', () => {
    expect(run({ pathname: SESSION_PATH, user: null }).cookies.get('__vdpl')).toBeUndefined()
  })

  it('does not pin when no deployment id is available', () => {
    delete process.env.VERCEL_DEPLOYMENT_ID
    expect(run({ pathname: SESSION_PATH }).cookies.get('__vdpl')).toBeUndefined()
  })

  it('expires a leftover pin on a page outside quiz sessions', () => {
    const response = run({ pathname: '/app/dashboard', pin: 'dpl_old' })
    const header = response.headers.get('set-cookie') ?? ''
    expect(header).toContain('__vdpl=;')
    expect(header).toContain('Path=/;')
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it('expires a leftover pin for a signed-out visitor too', () => {
    const response = run({ pathname: '/login', user: null, pin: 'dpl_old' })
    expect(response.headers.get('set-cookie') ?? '').toContain('__vdpl=;')
  })

  it('leaves cookies alone outside quiz sessions when no pin exists', () => {
    expect(run({ pathname: '/app/dashboard' }).headers.get('set-cookie')).toBeNull()
  })

  it('expires the session-scoped pin when a Server Action runs outside a quiz session', () => {
    const header = run({ pathname: '/app/quiz', action: true }).headers.get('set-cookie') ?? ''
    expect(header).toContain('__vdpl=;')
    expect(header).toContain('Path=/app/quiz/session')
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it('expires a leftover site-wide pin rather than the scoped one when a Server Action carries it', () => {
    const header =
      run({ pathname: '/app/quiz', action: true, pin: 'dpl_old' }).headers.get('set-cookie') ?? ''
    expect(header).toContain('__vdpl=;')
    expect(header).toContain('Path=/;')
    expect(header).not.toContain('Path=/app/quiz/session')
  })

  it('keeps the pin when a Server Action runs inside a quiz session', () => {
    const response = run({ pathname: SESSION_PATH, action: true, pin: 'dpl_old' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
