import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerSectionScoring } from './trigger-scoring'

const RESPONSE_ID = '00000000-0000-4000-a000-000000000010'
const AUDIO_PATH = 'org-1/student-1/session-1/1.webm'

describe('triggerSectionScoring', () => {
  const originalEnv = { ...process.env }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.ELP_WEBHOOK_SECRET = 'test-secret'
    process.env.SUPABASE_FUNCTIONS_URL = 'http://localhost:54321/functions/v1'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('posts the scoring payload to the Edge Function with the webhook secret header', () => {
    triggerSectionScoring(RESPONSE_ID, AUDIO_PATH, 1)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:54321/functions/v1/score-oral-section',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': 'test-secret' },
        body: JSON.stringify({
          record: { id: RESPONSE_ID, audio_path: AUDIO_PATH, section_no: 1 },
        }),
      },
    )
  })

  it('derives the functions base URL from NEXT_PUBLIC_SUPABASE_URL when SUPABASE_FUNCTIONS_URL is unset', () => {
    delete process.env.SUPABASE_FUNCTIONS_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'

    triggerSectionScoring(RESPONSE_ID, AUDIO_PATH, 2)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/score-oral-section',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('skips the fetch and logs when ELP_WEBHOOK_SECRET is not set', () => {
    delete process.env.ELP_WEBHOOK_SECRET

    triggerSectionScoring(RESPONSE_ID, AUDIO_PATH, 1)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[triggerSectionScoring] ELP_WEBHOOK_SECRET not set')
  })

  it('logs and does not throw when the fetch call rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    expect(() => triggerSectionScoring(RESPONSE_ID, AUDIO_PATH, 1)).not.toThrow()
    // Let the fire-and-forget promise's .catch() handler flush.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(console.error).toHaveBeenCalledWith(
      '[triggerSectionScoring] invoke failed:',
      expect.any(Error),
    )
  })

  it('logs the status and body when the Edge Function responds with a non-ok status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    })

    triggerSectionScoring(RESPONSE_ID, AUDIO_PATH, 1)
    // Let the fire-and-forget promise's .then() handler flush.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(console.error).toHaveBeenCalledWith(
      '[triggerSectionScoring] invoke returned',
      401,
      'unauthorized',
    )
  })
})
