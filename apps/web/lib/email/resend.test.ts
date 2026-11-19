import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn())
const mockBatchSend = vi.hoisted(() => vi.fn())

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
    batch = { send: mockBatchSend }
  },
}))

// ---- Subject under test ---------------------------------------------------

import { isEmailConfigured, sendEmail, sendEmailBatch } from './resend'

// ---- Helpers ---------------------------------------------------------------

const ARGS = {
  to: 'student@example.com',
  subject: 'Your exam access code',
  html: '<p>code</p>',
  text: 'code',
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendEmail', () => {
  it('sends via Resend when RESEND_API_KEY and EMAIL_FROM are present', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: true })
    expect(mockSend).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: ARGS.to,
      subject: ARGS.subject,
      html: ARGS.html,
      text: ARGS.text,
    })
  })

  it('logs and returns ok without sending when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: true })
    expect(mockSend).not.toHaveBeenCalled()
    // Recipient is redacted in the dev log — no raw PII (student@example.com -> s***@example.com).
    expect(logSpy).toHaveBeenCalledWith('[email] (dev, no RESEND_API_KEY) would send:', {
      to: 's***@example.com',
      subject: ARGS.subject,
    })
    logSpy.mockRestore()
  })

  it('fails loudly without logging PII when RESEND_API_KEY is absent in production', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendEmail] RESEND_API_KEY is not set — cannot send email',
    )
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('returns an error and does not send when EMAIL_FROM is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'EMAIL_FROM not configured' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns the error and logs it when the Resend SDK reports an error', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(errorSpy).toHaveBeenCalledWith('[sendEmail] Resend error:', 'rate limited')
    errorSpy.mockRestore()
  })

  it('returns send_failed and logs when the Resend SDK throws', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockRejectedValue(new Error('network down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(errorSpy).toHaveBeenCalledWith('[sendEmail] Unexpected error:', 'network down')
    errorSpy.mockRestore()
  })
})

describe('isEmailConfigured', () => {
  it('is configured when RESEND_API_KEY and EMAIL_FROM are present', () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    expect(isEmailConfigured()).toBe(true)
  })

  it('is not configured when EMAIL_FROM is missing', () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', '')
    expect(isEmailConfigured()).toBe(false)
  })

  it('is not configured in production without RESEND_API_KEY', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(isEmailConfigured()).toBe(false)
  })

  it('is configured outside production without RESEND_API_KEY (dev logging fallback)', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(isEmailConfigured()).toBe(true)
  })
})

describe('sendEmailBatch', () => {
  const msgs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      to: `s${i}@example.com`,
      subject: `subject ${i}`,
      html: `<p>${i}</p>`,
      text: `${i}`,
    }))
  const ok = (n: number, errors: { index: number; message: string }[] = []) => ({
    data: { data: Array.from({ length: n }, (_, i) => ({ id: `id-${i}` })), errors },
    error: null,
    headers: null,
  })
  const limited = (headers: Record<string, string> | null) => ({
    data: null,
    error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    headers,
  })
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends in chunks of 100 and reports every message as sent', async () => {
    mockBatchSend.mockImplementation(async (chunk: unknown[]) => ok(chunk.length))
    const result = await sendEmailBatch(msgs(250))
    expect(mockBatchSend.mock.calls.map((c) => (c[0] as unknown[]).length)).toEqual([100, 100, 50])
    expect([...result.sent].sort((a, b) => a - b)).toEqual(range(0, 250))
    expect(result.failed).toEqual([])
  })

  it('sends each message with the configured from address, in input order, permissively', async () => {
    mockBatchSend.mockResolvedValue(ok(2))
    await sendEmailBatch(msgs(2))
    const [chunk, options] = mockBatchSend.mock.calls[0] as [unknown[], unknown]
    expect(chunk[1]).toMatchObject({
      from: 'noreply@example.com',
      to: 's1@example.com',
      subject: 'subject 1',
      html: '<p>1</p>',
      text: '1',
    })
    expect(options).toMatchObject({ batchValidation: 'permissive' })
  })

  it('maps permissive errors to failed global indexes and does not mark them sent', async () => {
    mockBatchSend
      .mockResolvedValueOnce(ok(100))
      .mockResolvedValueOnce(ok(99, [{ index: 3, message: 'Invalid `to` field' }]))
    const result = await sendEmailBatch(msgs(200))
    expect(result.failed.map((f) => f.index)).toEqual([103])
    expect(result.sent).not.toContain(103)
    expect(result.sent).toHaveLength(199)
  })

  it('waits retry-after seconds on a 429, then retries the chunk', async () => {
    vi.useFakeTimers()
    mockBatchSend
      .mockResolvedValueOnce(limited({ 'retry-after': '2' }))
      .mockResolvedValueOnce(ok(3))
    const p = sendEmailBatch(msgs(3))
    await vi.advanceTimersByTimeAsync(1900)
    expect(mockBatchSend).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    const result = await p
    expect(mockBatchSend).toHaveBeenCalledTimes(2)
    expect(result.sent).toEqual([0, 1, 2])
    expect(result.failed).toEqual([])
  })

  it('reads retry-after case-insensitively', async () => {
    vi.useFakeTimers()
    mockBatchSend
      .mockResolvedValueOnce(limited({ 'Retry-After': '3' }))
      .mockResolvedValueOnce(ok(1))
    const p = sendEmailBatch(msgs(1))
    await vi.advanceTimersByTimeAsync(2900)
    expect(mockBatchSend).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    expect((await p).sent).toEqual([0])
  })

  it('waits 1 s when the 429 carries no headers', async () => {
    vi.useFakeTimers()
    mockBatchSend.mockResolvedValueOnce(limited(null)).mockResolvedValueOnce(ok(1))
    const p = sendEmailBatch(msgs(1))
    await vi.advanceTimersByTimeAsync(900)
    expect(mockBatchSend).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    expect((await p).sent).toEqual([0])
  })

  it('clamps the retry-after wait to 10 s', async () => {
    vi.useFakeTimers()
    mockBatchSend
      .mockResolvedValueOnce(limited({ 'retry-after': '60' }))
      .mockResolvedValueOnce(ok(1))
    const p = sendEmailBatch(msgs(1))
    await vi.advanceTimersByTimeAsync(10_100)
    expect((await p).sent).toEqual([0])
  })

  it('gives up after 2 retries and reports the whole chunk failed', async () => {
    vi.useFakeTimers()
    mockBatchSend.mockResolvedValue(limited({ 'retry-after': '1' }))
    const p = sendEmailBatch(msgs(3))
    await vi.advanceTimersByTimeAsync(30_000)
    const result = await p
    expect(mockBatchSend).toHaveBeenCalledTimes(3)
    expect(result.sent).toEqual([])
    expect(result.failed.map((f) => f.index)).toEqual([0, 1, 2])
  })

  it('treats a throwing chunk as failed and still sends the next chunk', async () => {
    mockBatchSend.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(ok(20))
    const result = await sendEmailBatch(msgs(120))
    expect(result.failed.map((f) => f.index)).toEqual(range(0, 100))
    expect(result.sent).toEqual(range(100, 120))
  })

  it('treats a non-429 error as a failed chunk without retrying', async () => {
    mockBatchSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'bad' },
      headers: null,
    })
    const result = await sendEmailBatch(msgs(2))
    expect(mockBatchSend).toHaveBeenCalledTimes(1)
    expect(result.sent).toEqual([])
    expect(result.failed.map((f) => f.index)).toEqual([0, 1])
  })

  it('logs and reports all sent without calling Resend when RESEND_API_KEY is absent outside production', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await sendEmailBatch(msgs(3))
    expect(mockBatchSend).not.toHaveBeenCalled()
    expect(result.sent).toEqual([0, 1, 2])
    expect(result.failed).toEqual([])
  })

  it('reports all failed when RESEND_API_KEY is absent in production', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    const result = await sendEmailBatch(msgs(3))
    expect(mockBatchSend).not.toHaveBeenCalled()
    expect(result.sent).toEqual([])
    expect(result.failed.map((f) => f.index)).toEqual([0, 1, 2])
  })

  it('reports all failed without calling Resend when EMAIL_FROM is missing', async () => {
    vi.stubEnv('EMAIL_FROM', '')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await sendEmailBatch(msgs(2))
    expect(mockBatchSend).not.toHaveBeenCalled()
    expect(result.sent).toEqual([])
    expect(result.failed.map((f) => f.index)).toEqual([0, 1])
  })
})
