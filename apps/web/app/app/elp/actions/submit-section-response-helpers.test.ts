import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks (needed by recordResponse which calls rpc) --------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import {
  audioExt,
  extractAudioFile,
  parseInput,
  recordResponse,
  resolveOrgId,
} from './submit-section-response-helpers'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const RESPONSE_ID = '00000000-0000-4000-a000-000000000099'
const USER_ID = '00000000-0000-4000-a000-000000000002'
const ORG_ID = '00000000-0000-4000-a000-000000000010'
const AUDIO_PATH = `${ORG_ID}/${USER_ID}/${SESSION_ID}/1.webm`

const VALID_INPUT = { sessionId: SESSION_ID, sectionNo: 3, durationMs: 4000 }

// ---- Helpers --------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, val] of Object.entries(fields)) {
    fd.append(key, val)
  }
  return fd
}

function makeFile(name: string, size: number, type = 'audio/webm'): File {
  const content = new Uint8Array(size)
  return new File([content], name, { type })
}

// Minimal fake Supabase client for resolveOrgId (only .from() is used)
function makeFromClient(terminal: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(terminal),
  }
  return { from: vi.fn().mockReturnValue(chain) }
}

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- parseInput -----------------------------------------------------------

describe('parseInput', () => {
  it('returns parsed values for valid FormData', () => {
    const fd = makeFormData({ sessionId: SESSION_ID, sectionNo: '2', durationMs: '5000' })
    const result = parseInput(fd)
    expect(result).toEqual({ sessionId: SESSION_ID, sectionNo: 2, durationMs: 5000 })
  })

  it('returns null when sessionId is not a valid UUID', () => {
    const fd = makeFormData({ sessionId: 'not-a-uuid', sectionNo: '1' })
    expect(parseInput(fd)).toBeNull()
  })

  it('returns null when sectionNo is below the minimum of 1', () => {
    const fd = makeFormData({ sessionId: SESSION_ID, sectionNo: '0' })
    expect(parseInput(fd)).toBeNull()
  })

  it('returns null when sectionNo exceeds the maximum of 5', () => {
    const fd = makeFormData({ sessionId: SESSION_ID, sectionNo: '6' })
    expect(parseInput(fd)).toBeNull()
  })

  it('returns null when sessionId is absent', () => {
    const fd = makeFormData({ sectionNo: '1' })
    expect(parseInput(fd)).toBeNull()
  })

  it('accepts the boundary sectionNo values 1 and 5', () => {
    expect(parseInput(makeFormData({ sessionId: SESSION_ID, sectionNo: '1' }))?.sectionNo).toBe(1)
    expect(parseInput(makeFormData({ sessionId: SESSION_ID, sectionNo: '5' }))?.sectionNo).toBe(5)
  })

  it('omits durationMs from the result when it is not supplied', () => {
    const fd = makeFormData({ sessionId: SESSION_ID, sectionNo: '1' })
    const result = parseInput(fd)
    expect(result?.durationMs).toBeUndefined()
  })
})

// ---- extractAudioFile -----------------------------------------------------

describe('extractAudioFile', () => {
  it('returns null when the value is null', () => {
    expect(extractAudioFile(null)).toBeNull()
  })

  it('returns null when the value is a plain string', () => {
    expect(extractAudioFile('audio-data')).toBeNull()
  })

  it('returns null when the file is empty', () => {
    expect(extractAudioFile(makeFile('rec.webm', 0))).toBeNull()
  })

  it('returns null when the file exceeds the 25 MB limit', () => {
    expect(extractAudioFile(makeFile('rec.webm', 25 * 1024 * 1024 + 1))).toBeNull()
  })

  it('returns the file when it is within the size limit', () => {
    const file = makeFile('rec.webm', 1024)
    expect(extractAudioFile(file)).toBe(file)
  })

  it('accepts a file at exactly the maximum allowed size', () => {
    const file = makeFile('rec.webm', 25 * 1024 * 1024)
    expect(extractAudioFile(file)).toBe(file)
  })
})

// ---- audioExt -------------------------------------------------------------

describe('audioExt', () => {
  it.each([
    ['webm', 'recording.webm'],
    ['mp4', 'clip.mp4'],
    ['m4a', 'track.m4a'],
    ['mp3', 'sound.mp3'],
    ['wav', 'wave.wav'],
    ['ogg', 'audio.ogg'],
    ['oga', 'voice.oga'],
  ])('returns the %s extension for a file named %s', (expected, fileName) => {
    expect(audioExt(fileName)).toBe(expected)
  })

  it('falls back to webm for an unrecognised extension', () => {
    expect(audioExt('recording.xyz')).toBe('webm')
  })

  it('falls back to webm when the filename has no extension', () => {
    expect(audioExt('recording')).toBe('webm')
  })

  it('normalises an uppercase extension to the correct format', () => {
    expect(audioExt('recording.MP3')).toBe('mp3')
  })
})

// ---- resolveOrgId ---------------------------------------------------------

describe('resolveOrgId', () => {
  it('returns the organization id for a valid user', async () => {
    const client = makeFromClient({ data: { organization_id: ORG_ID }, error: null })
    const result = await resolveOrgId(
      client as unknown as Parameters<typeof resolveOrgId>[0],
      USER_ID,
    )
    expect(result).toBe(ORG_ID)
  })

  it('returns null when the database query fails', async () => {
    const client = makeFromClient({ data: null, error: { message: 'connection refused' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await resolveOrgId(
      client as unknown as Parameters<typeof resolveOrgId>[0],
      USER_ID,
    )
    consoleSpy.mockRestore()
    expect(result).toBeNull()
  })

  it('returns null when the user profile has no organization_id', async () => {
    const client = makeFromClient({ data: { organization_id: null }, error: null })
    const result = await resolveOrgId(
      client as unknown as Parameters<typeof resolveOrgId>[0],
      USER_ID,
    )
    expect(result).toBeNull()
  })

  it('does not expose the database error message to the caller', async () => {
    const client = makeFromClient({ data: null, error: { message: 'secret internal detail' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await resolveOrgId(
      client as unknown as Parameters<typeof resolveOrgId>[0],
      USER_ID,
    )
    consoleSpy.mockRestore()
    // Returns null (not an error string with the raw message)
    expect(result).toBeNull()
  })
})

// ---- recordResponse -------------------------------------------------------

describe('recordResponse', () => {
  // Shorthand — supabase is forwarded to the mocked rpc(), so any object works.
  const fakeClient = {} as unknown as Parameters<typeof recordResponse>[0]

  it('returns the response id on a successful submission', async () => {
    mockRpc.mockResolvedValue({ data: RESPONSE_ID, error: null })
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    expect(result).toEqual({ success: true, responseId: RESPONSE_ID })
  })

  it('returns an account-inactive message when the student account is soft-deleted', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found_or_inactive' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Your account is inactive. Please contact your administrator.',
    })
  })

  it('returns an already-submitted error when the section was already recorded', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'section_already_submitted' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'This section was already submitted.' })
  })

  it('returns a session-ended error when the oral exam is no longer active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'oral_session_not_active' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'This oral exam is no longer active.' })
  })

  it('returns a not-found error when the session does not exist', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'oral_session_not_found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Oral exam session not found.' })
  })

  it('returns a generic error for an unrecognised RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'internal_error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to submit section. Please try again.' })
  })

  it('returns a generic error when the RPC returns no data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await recordResponse(fakeClient, VALID_INPUT, AUDIO_PATH)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to submit section. Please try again.' })
  })

  it('passes null for durationMs when the input omits it', async () => {
    mockRpc.mockResolvedValue({ data: RESPONSE_ID, error: null })
    const inputWithoutDuration = { sessionId: SESSION_ID, sectionNo: 1 }
    await recordResponse(fakeClient, inputWithoutDuration, AUDIO_PATH)
    expect(mockRpc).toHaveBeenCalledWith(
      fakeClient,
      'submit_oral_section_response',
      expect.objectContaining({ p_duration_ms: null }),
    )
  })
})
