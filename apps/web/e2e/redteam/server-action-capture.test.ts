import { describe, expect, it, vi } from 'vitest'
import {
  buildReplayHeaders,
  extractActionIds,
  postServerAction,
  watchServerActions,
} from './server-action-capture'

const ID_A = 'a'.repeat(40)
const ID_B = 'b'.repeat(42)

describe('extractActionIds', () => {
  it('keeps the action id from a production bundle reference', () => {
    const ids = new Map<string, string>()
    extractActionIds(
      `x=createServerReference("${ID_A}",callServer,void 0,findSourceMapURL,"discardQuiz")`,
      ids,
    )
    expect(ids.get('discardQuiz')).toBe(ID_A)
  })

  it('keeps the action id from a dev bundle entry comment', () => {
    const ids = new Map<string, string>()
    extractActionIds(`/* [{"${ID_B}":{"name":"finishQuizSession"}}] */`, ids)
    expect(ids.get('finishQuizSession')).toBe(ID_B)
  })

  it('leaves the map empty when the script holds no action reference', () => {
    const ids = new Map<string, string>()
    extractActionIds('const a = {"short":{"name":"x"}}; foo("deadbeef")', ids)
    expect(ids.size).toBe(0)
  })
})

describe('buildReplayHeaders', () => {
  const captured = {
    Cookie: 'sb=secret',
    'Content-Length': '12',
    HOST: 'localhost:3000',
    accept: 'text/x-component',
    'next-action': 'old',
    origin: 'http://elsewhere',
  }

  it('drops cookie, content-length and host whatever their casing', () => {
    const out = buildReplayHeaders(captured, 'new', 'http://localhost:3000')
    const keys = Object.keys(out).map((k) => k.toLowerCase())
    expect(keys).toContain('accept')
    expect(keys).not.toContain('cookie')
    expect(keys).not.toContain('content-length')
    expect(keys).not.toContain('host')
  })

  it('overrides next-action and origin and keeps other headers', () => {
    const out = buildReplayHeaders(captured, 'new', 'http://localhost:3000')
    expect(out['next-action']).toBe('new')
    expect(out.origin).toBe('http://localhost:3000')
    expect(out.accept).toBe('text/x-component')
  })
})

describe('postServerAction', () => {
  it('posts the argument as a one-element JSON array with replay headers and no redirects', async () => {
    const post = vi.fn().mockResolvedValue({ text: async () => 'body' })
    const text = await postServerAction(
      { post },
      {
        url: 'http://localhost:3000/p',
        headers: { cookie: 'x', accept: 'a' },
        id: 'abc',
        origin: 'http://localhost:3000',
        arg: { sessionId: 's' },
      },
    )
    expect(text).toBe('body')
    expect(post).toHaveBeenCalledWith('http://localhost:3000/p', {
      headers: { accept: 'a', 'next-action': 'abc', origin: 'http://localhost:3000' },
      data: '[{"sessionId":"s"}]',
      maxRedirects: 0,
    })
  })
})

describe('watchServerActions', () => {
  function fakePage() {
    const handlers: Record<string, (arg: unknown) => void> = {}
    return {
      handlers,
      page: {
        on: (ev: string, fn: (arg: unknown) => void) => {
          handlers[ev] = fn
        },
      },
    }
  }

  it('records ids from next bundles only and the first action request headers', async () => {
    const { handlers, page } = fakePage()
    const watch = watchServerActions(page as never)
    const script = (url: string, js: string) => ({ url: () => url, text: async () => js })
    const ref = `createServerReference("${ID_A}",c,void 0,f,"discardQuiz")`
    handlers.response?.(script('http://x/_next/static/a.js?v=1', ref))
    handlers.response?.(
      script('http://x/other/b.js', `createServerReference("${ID_B}",c,void 0,f,"other")`),
    )
    handlers.response?.(script('http://x/_next/static/c.css', ref.replace('discardQuiz', 'css')))
    expect(watch.headers()).toBeUndefined()
    const req = (h: Record<string, string>, method = 'POST') => ({
      method: () => method,
      headers: () => h,
    })
    handlers.request?.(req({ 'next-action': 'one' }, 'GET'))
    handlers.request?.(req({ 'next-action': 'first' }))
    handlers.request?.(req({ 'next-action': 'second' }))
    expect(watch.headers()).toEqual({ 'next-action': 'first' })
    const ids = await watch.settle()
    expect([...ids.keys()]).toEqual(['discardQuiz'])
  })
})
