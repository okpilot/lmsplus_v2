import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetTopicsForSubject, mockGetSubtopicsForTopic } = vi.hoisted(() => ({
  mockGetTopicsForSubject: vi.fn(),
  mockGetSubtopicsForTopic: vi.fn(),
}))

const { mockGetTopicsWithSubtopics } = vi.hoisted(() => ({
  mockGetTopicsWithSubtopics: vi.fn(),
}))

const mockRequireAuthUser = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: mockRequireAuthUser,
}))

vi.mock('@/lib/queries/quiz-subject-queries', () => ({
  getTopicsForSubject: (...args: unknown[]) => mockGetTopicsForSubject(...args),
  getSubtopicsForTopic: (...args: unknown[]) => mockGetSubtopicsForTopic(...args),
  getTopicsWithSubtopics: (...args: unknown[]) => mockGetTopicsWithSubtopics(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { fetchSubtopicsForTopic, fetchTopicsForSubject, fetchTopicsWithSubtopics } from './lookup'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'

const TOPIC_OPTIONS = [{ id: TOPIC_ID, name: 'Aerodynamics', code: 'AERO' }]

const SUBTOPIC_OPTIONS = [{ id: SUBTOPIC_ID, name: 'Lift', code: 'LIFT' }]

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: USER_ID })
})

// ---- fetchTopicsForSubject ------------------------------------------------

describe('fetchTopicsForSubject', () => {
  it('returns the topics for the given subjectId', async () => {
    mockGetTopicsForSubject.mockResolvedValue(TOPIC_OPTIONS)
    const result = await fetchTopicsForSubject(SUBJECT_ID)
    expect(mockGetTopicsForSubject).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result).toEqual(TOPIC_OPTIONS)
  })

  it('returns an empty array when the underlying query returns none', async () => {
    mockGetTopicsForSubject.mockResolvedValue([])
    const result = await fetchTopicsForSubject(SUBJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsForSubject('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsForSubject] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsForSubject(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsForSubject] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the underlying helper throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetTopicsForSubject.mockRejectedValue(new Error('DB connection lost'))
    const result = await fetchTopicsForSubject(SUBJECT_ID)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchTopicsForSubject] query error:',
      'DB connection lost',
    )
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchTopicsForSubject(SUBJECT_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})

// ---- fetchSubtopicsForTopic -----------------------------------------------

describe('fetchSubtopicsForTopic', () => {
  it('returns the subtopics for the given topicId', async () => {
    mockGetSubtopicsForTopic.mockResolvedValue(SUBTOPIC_OPTIONS)
    const result = await fetchSubtopicsForTopic(TOPIC_ID)
    expect(mockGetSubtopicsForTopic).toHaveBeenCalledWith(TOPIC_ID)
    expect(result).toEqual(SUBTOPIC_OPTIONS)
  })

  it('returns an empty array when the underlying query returns none', async () => {
    mockGetSubtopicsForTopic.mockResolvedValue([])
    const result = await fetchSubtopicsForTopic(TOPIC_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchSubtopicsForTopic('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchSubtopicsForTopic] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchSubtopicsForTopic(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchSubtopicsForTopic] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the underlying helper throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSubtopicsForTopic.mockRejectedValue(new Error('RPC timeout'))
    const result = await fetchSubtopicsForTopic(TOPIC_ID)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchSubtopicsForTopic] query error:', 'RPC timeout')
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchSubtopicsForTopic(TOPIC_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})

// ---- fetchTopicsWithSubtopics ---------------------------------------------

const TOPIC_WITH_SUBTOPICS = [
  {
    id: TOPIC_ID,
    code: 'AERO',
    name: 'Aerodynamics',
    questionCount: 5,
    subtopics: [{ id: SUBTOPIC_ID, code: 'LIFT', name: 'Lift', questionCount: 3 }],
  },
]

describe('fetchTopicsWithSubtopics', () => {
  it('returns the topics-with-subtopics tree for the given subjectId', async () => {
    mockGetTopicsWithSubtopics.mockResolvedValue(TOPIC_WITH_SUBTOPICS)
    const result = await fetchTopicsWithSubtopics(SUBJECT_ID)
    expect(mockGetTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result).toEqual(TOPIC_WITH_SUBTOPICS)
  })

  it('returns an empty array when no topics exist for the subject', async () => {
    mockGetTopicsWithSubtopics.mockResolvedValue([])
    const result = await fetchTopicsWithSubtopics(SUBJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsWithSubtopics('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsWithSubtopics] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsWithSubtopics(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsWithSubtopics] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the underlying helper throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetTopicsWithSubtopics.mockRejectedValue(new Error('subtopics query failed'))
    const result = await fetchTopicsWithSubtopics(SUBJECT_ID)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchTopicsWithSubtopics] query error:',
      'subtopics query failed',
    )
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchTopicsWithSubtopics(SUBJECT_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})
