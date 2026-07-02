import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockFrom, mockStorageFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  }),
}))

// rpc is used inside recordResponse (imported from helpers)
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { submitSectionResponse } from './submit-section-response'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const RESPONSE_ID = '00000000-0000-4000-a000-000000000077'

// ---- Helpers --------------------------------------------------------------

function makeAudioFile(name = 'rec.webm', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'audio/webm' })
}

function makeFormData(
  opts: { audio?: File | null; sessionId?: string; sectionNo?: string; durationMs?: string } = {},
): FormData {
  const fd = new FormData()
  const audio = opts.audio === undefined ? makeAudioFile() : opts.audio
  if (audio) fd.append('audio', audio)
  fd.append('sessionId', opts.sessionId ?? SESSION_ID)
  fd.append('sectionNo', opts.sectionNo ?? '1')
  if (opts.durationMs !== undefined) fd.append('durationMs', opts.durationMs)
  return fd
}

function setupAuth(
  opts: { user?: { id: string } | null; error?: { message: string } | null } = {},
) {
  const { user = { id: USER_ID }, error = null } = opts
  mockGetUser.mockResolvedValue({ data: { user }, error })
}

function setupOrgLookup(orgId: string | null = ORG_ID) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue({
      data: { organization_id: orgId },
      error: null,
    }),
  }
  mockFrom.mockReturnValue(chain)
}

function setupStorage(
  opts: { uploadError?: { message: string } | null; removeError?: { message: string } | null } = {},
) {
  const { uploadError = null, removeError = null } = opts
  const mockUpload = vi.fn().mockResolvedValue({ error: uploadError })
  const mockRemove = vi.fn().mockResolvedValue({ error: removeError })
  mockStorageFrom.mockReturnValue({ upload: mockUpload, remove: mockRemove })
  return { mockUpload, mockRemove }
}

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------

describe('submitSectionResponse', () => {
  it('returns failure when the user is not authenticated', async () => {
    setupAuth({ user: null })
    const result = await submitSectionResponse(makeFormData())
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
    const result = await submitSectionResponse(makeFormData())
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when no audio file is provided', async () => {
    setupAuth()
    const result = await submitSectionResponse(makeFormData({ audio: null }))
    expect(result).toEqual({ success: false, error: 'Invalid or missing audio file' })
  })

  it('returns failure when the audio file is empty', async () => {
    setupAuth()
    const emptyFile = new File([], 'rec.webm', { type: 'audio/webm' })
    const result = await submitSectionResponse(makeFormData({ audio: emptyFile }))
    expect(result).toEqual({ success: false, error: 'Invalid or missing audio file' })
  })

  it('returns failure when the FormData contains an invalid session id', async () => {
    setupAuth()
    const result = await submitSectionResponse(makeFormData({ sessionId: 'not-a-uuid' }))
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns failure when the organization lookup fails', async () => {
    setupAuth()
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue({ data: null, error: { message: 'not found' } }),
    }
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await submitSectionResponse(makeFormData())
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Could not resolve organization' })
  })

  it('returns failure when the audio upload fails', async () => {
    setupAuth()
    setupOrgLookup()
    setupStorage({ uploadError: { message: 'bucket not found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await submitSectionResponse(makeFormData())
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Audio upload failed' })
  })

  it('removes the uploaded file when the section RPC fails after a successful upload', async () => {
    setupAuth()
    setupOrgLookup()
    const { mockRemove } = setupStorage()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'oral_session_not_found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await submitSectionResponse(makeFormData())
    consoleSpy.mockRestore()
    expect(mockRemove).toHaveBeenCalledOnce()
  })

  it('logs a warning when the orphan-file removal also fails', async () => {
    setupAuth()
    setupOrgLookup()
    setupStorage({ removeError: { message: 'storage unavailable' } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'oral_session_not_active' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await submitSectionResponse(makeFormData())
    const logMessages = consoleSpy.mock.calls.map((c) => String(c[0]))
    consoleSpy.mockRestore()
    expect(logMessages.some((m) => m.includes('orphan cleanup failed'))).toBe(true)
  })

  it('returns the response id on a successful submission', async () => {
    setupAuth()
    setupOrgLookup()
    setupStorage()
    mockRpc.mockResolvedValue({ data: RESPONSE_ID, error: null })
    const result = await submitSectionResponse(makeFormData({ durationMs: '3000' }))
    expect(result).toEqual({ success: true, responseId: RESPONSE_ID })
  })

  it('stores the audio at a path that includes org, user, session, and section', async () => {
    setupAuth()
    setupOrgLookup()
    const { mockUpload } = setupStorage()
    mockRpc.mockResolvedValue({ data: RESPONSE_ID, error: null })
    await submitSectionResponse(makeFormData({ sectionNo: '2' }))
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${ORG_ID}/${USER_ID}/${SESSION_ID}/2\\.`)),
      expect.any(File),
      expect.objectContaining({ upsert: false }),
    )
  })

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await submitSectionResponse(makeFormData())
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })
})
