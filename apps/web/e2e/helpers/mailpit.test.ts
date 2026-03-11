import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllMessages, extractMagicLink, getLatestEmail } from './mailpit'

const MOCK_MESSAGE = {
  ID: 'msg-1',
  From: { Name: '', Address: 'no-reply@supabase.io' },
  To: [{ Name: '', Address: 'test@example.com' }],
  Subject: 'Your magic link',
  Created: '2026-03-11T10:00:00Z',
  Size: 1234,
}

const MOCK_DETAIL = {
  ID: 'msg-1',
  From: { Name: '', Address: 'no-reply@supabase.io' },
  Subject: 'Your magic link',
  Date: '2026-03-11T10:00:00Z',
  Text: 'Sign in link',
  HTML: '<a href="http://localhost:54321/auth/v1/verify?token=abc&amp;type=magiclink">Sign in</a>',
}

// ---------------------------------------------------------------------------
// extractMagicLink
// ---------------------------------------------------------------------------

describe('extractMagicLink', () => {
  it('extracts and decodes the Supabase verify URL', () => {
    const html =
      '<a href="http://localhost:54321/auth/v1/verify?token=abc&amp;type=magiclink">Sign in</a>'
    expect(extractMagicLink(html)).toBe(
      'http://localhost:54321/auth/v1/verify?token=abc&type=magiclink',
    )
  })

  it('falls back to any http link when no verify path present', () => {
    const html = '<a href="http://example.com/link">Click</a>'
    expect(extractMagicLink(html)).toBe('http://example.com/link')
  })

  it('decodes &amp; entities in the fallback link', () => {
    const html = '<a href="http://example.com?a=1&amp;b=2">Click</a>'
    expect(extractMagicLink(html)).toBe('http://example.com?a=1&b=2')
  })

  it('throws when no links are found in the HTML', () => {
    expect(() => extractMagicLink('<p>No links here</p>')).toThrow(
      'Could not extract magic link from email body',
    )
  })

  it('prefers the verify URL over other http links in the same email', () => {
    const html = `
      <a href="http://unsubscribe.example.com">Unsubscribe</a>
      <a href="http://localhost:54321/auth/v1/verify?token=xyz&amp;type=magiclink">Sign in</a>
    `
    const result = extractMagicLink(html)
    expect(result).toContain('/auth/v1/verify')
    expect(result).toContain('token=xyz')
    expect(result).not.toContain('&amp;')
  })
})

// ---------------------------------------------------------------------------
// clearAllMessages
// ---------------------------------------------------------------------------

describe('clearAllMessages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends DELETE to Mailpit messages endpoint', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response())
    await clearAllMessages('test@example.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54324/api/v1/messages',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['*'] }),
      }),
    )
  })

  it('still clears all messages when no email is provided', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response())
    await clearAllMessages()
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54324/api/v1/messages',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws when the DELETE request returns a non-OK status', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(null, { status: 503 }))
    await expect(clearAllMessages('test@example.com')).rejects.toThrow('clearAllMessages: 503')
  })
})

// ---------------------------------------------------------------------------
// getLatestEmail
// ---------------------------------------------------------------------------

describe('getLatestEmail', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mockFetchResponses(searchMessages: unknown[], detail = MOCK_DETAIL) {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/api/v1/search')) {
        return new Response(JSON.stringify({ messages: searchMessages }))
      }
      if (u.includes('/api/v1/message/')) {
        return new Response(JSON.stringify(detail))
      }
      return new Response('{}')
    })
  }

  it('returns the message detail when a message is found on the first poll', async () => {
    mockFetchResponses([MOCK_MESSAGE])
    const result = await getLatestEmail('test@example.com')
    expect(result.HTML).toBe(MOCK_DETAIL.HTML)
    expect(result.Subject).toBe(MOCK_DETAIL.Subject)
  })

  it('retries and returns the message when it appears on the second poll', async () => {
    let listCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/api/v1/search')) {
        listCallCount++
        const messages = listCallCount === 1 ? [] : [MOCK_MESSAGE]
        return new Response(JSON.stringify({ messages }))
      }
      if (u.includes('/api/v1/message/')) {
        return new Response(JSON.stringify(MOCK_DETAIL))
      }
      return new Response('{}')
    })

    const promise = getLatestEmail('test@example.com')
    await vi.advanceTimersByTimeAsync(500)
    const result = await promise
    expect(result.HTML).toBe(MOCK_DETAIL.HTML)
    expect(listCallCount).toBe(2)
  })

  it('throws after 10 seconds when no messages are ever received', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ messages: [] })),
    )

    const promise = getLatestEmail('test@example.com')
    const expectation = expect(promise).rejects.toThrow(
      'No email received for test@example.com within 10000ms',
    )
    await vi.advanceTimersByTimeAsync(10_500)
    await expectation
  })

  it('returns the most recently created message when multiple exist', async () => {
    const olderMessage = { ...MOCK_MESSAGE, ID: 'msg-old', Created: '2026-03-11T09:00:00Z' }
    const newerMessage = { ...MOCK_MESSAGE, ID: 'msg-new', Created: '2026-03-11T11:00:00Z' }
    const newerDetail = { ...MOCK_DETAIL, ID: 'msg-new' }

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/api/v1/search')) {
        return new Response(JSON.stringify({ messages: [olderMessage, newerMessage] }))
      }
      if (u.includes('/msg-new')) {
        return new Response(JSON.stringify(newerDetail))
      }
      return new Response(JSON.stringify(MOCK_DETAIL))
    })

    const result = await getLatestEmail('test@example.com')
    expect(result.Subject).toBe(newerDetail.Subject)
  })

  it('surfaces Mailpit search polling failures', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    const promise = getLatestEmail('test@example.com')
    await expect(promise).rejects.toThrow('listMessages: 500')
  })

  it('surfaces Mailpit message detail failures', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/api/v1/search')) {
        return new Response(JSON.stringify({ messages: [MOCK_MESSAGE] }))
      }
      return new Response(null, { status: 404 })
    })
    const promise = getLatestEmail('test@example.com')
    await expect(promise).rejects.toThrow('getMessage: 404')
  })
})
