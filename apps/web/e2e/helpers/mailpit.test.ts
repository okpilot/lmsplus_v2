import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllMessages, extractMagicLink, getLatestEmail } from './mailpit'

const MOCK_MESSAGE = {
  ID: 'msg-1',
  Created: '2026-03-11T10:00:00Z',
  From: { Name: 'Supabase', Address: 'no-reply@supabase.io' },
  To: [{ Name: '', Address: 'test@example.com' }],
  Subject: 'Your magic link',
  Snippet: 'Click to sign in',
}

const MOCK_DETAIL = {
  ID: 'msg-1',
  From: { Name: 'Supabase', Address: 'no-reply@supabase.io' },
  Subject: 'Your magic link',
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

  it('sends a DELETE request to the Mailpit messages endpoint', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response())
    await clearAllMessages()
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:54324/api/v1/messages', {
      method: 'DELETE',
    })
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

  function mockFetchResponses(searchResponse: unknown, detail = MOCK_DETAIL) {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/search')) {
        return new Response(JSON.stringify(searchResponse))
      }
      if (u.includes('/message/')) {
        return new Response(JSON.stringify(detail))
      }
      return new Response('{}')
    })
  }

  it('returns the message detail when a message is found on the first poll', async () => {
    mockFetchResponses({ total: 1, messages: [MOCK_MESSAGE] })
    const result = await getLatestEmail('test@example.com')
    expect(result).toEqual(MOCK_DETAIL)
  })

  it('retries and returns the message when it appears on the second poll', async () => {
    let searchCallCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/search')) {
        searchCallCount++
        const messages = searchCallCount === 1 ? [] : [MOCK_MESSAGE]
        return new Response(JSON.stringify({ total: messages.length, messages }))
      }
      if (u.includes('/message/')) {
        return new Response(JSON.stringify(MOCK_DETAIL))
      }
      return new Response('{}')
    })

    const promise = getLatestEmail('test@example.com')
    await vi.advanceTimersByTimeAsync(500)
    const result = await promise
    expect(result).toEqual(MOCK_DETAIL)
    expect(searchCallCount).toBe(2)
  })

  it('throws after 10 seconds when no messages are ever received', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ total: 0, messages: [] })),
    )

    const promise = getLatestEmail('test@example.com')
    // Attach rejection handler BEFORE advancing timers to avoid unhandledRejection warning
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
      if (u.includes('/search')) {
        // Return in reverse chronological order (older first) to verify sorting
        return new Response(JSON.stringify({ total: 2, messages: [olderMessage, newerMessage] }))
      }
      if (u.includes('/message/msg-new')) {
        return new Response(JSON.stringify(newerDetail))
      }
      return new Response(JSON.stringify(MOCK_DETAIL))
    })

    const result = await getLatestEmail('test@example.com')
    expect(result.ID).toBe('msg-new')
  })

  it('encodes the email address in the search query', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = url.toString()
      if (u.includes('/search')) {
        return new Response(JSON.stringify({ total: 1, messages: [MOCK_MESSAGE] }))
      }
      return new Response(JSON.stringify(MOCK_DETAIL))
    })

    await getLatestEmail('student+tag@test.com')
    // Test setup guarantees at least one fetch call
    const searchUrl = mockFetch.mock.calls[0]![0].toString()
    expect(searchUrl).toContain(encodeURIComponent('to:student+tag@test.com'))
  })

  it('throws when the Mailpit search endpoint returns a non-OK status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    const promise = getLatestEmail('test@example.com')
    await expect(promise).rejects.toThrow('searchMessages: 500')
  })
})
