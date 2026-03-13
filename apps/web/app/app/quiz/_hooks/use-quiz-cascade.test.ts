import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFetchTopicsForSubject, mockFetchSubtopicsForTopic } = vi.hoisted(() => ({
  mockFetchTopicsForSubject: vi.fn(),
  mockFetchSubtopicsForTopic: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  fetchTopicsForSubject: (...args: unknown[]) => mockFetchTopicsForSubject(...args),
  fetchSubtopicsForTopic: (...args: unknown[]) => mockFetchSubtopicsForTopic(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useQuizCascade } from './use-quiz-cascade'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-0000-0000-000000000010'
const TOPIC_ID = '00000000-0000-0000-0000-000000000020'
const SUBTOPIC_ID = '00000000-0000-0000-0000-000000000030'

const TOPICS = [{ id: TOPIC_ID, name: 'Aerodynamics', code: 'AERO' }]

const SUBTOPICS = [{ id: SUBTOPIC_ID, name: 'Lift', code: 'LIFT' }]

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchTopicsForSubject.mockResolvedValue(TOPICS)
  mockFetchSubtopicsForTopic.mockResolvedValue(SUBTOPICS)
})

// ---- Initial state --------------------------------------------------------

describe('useQuizCascade — initial state', () => {
  it('starts with empty string IDs and empty option arrays', () => {
    const { result } = renderHook(() => useQuizCascade())
    expect(result.current.subjectId).toBe('')
    expect(result.current.topicId).toBe('')
    expect(result.current.subtopicId).toBe('')
    expect(result.current.topics).toEqual([])
    expect(result.current.subtopics).toEqual([])
  })
})

// ---- handleSubjectChange -------------------------------------------------

describe('useQuizCascade — handleSubjectChange', () => {
  it('updates subjectId to the new value', async () => {
    const { result } = renderHook(() => useQuizCascade())
    await act(async () => result.current.handleSubjectChange(SUBJECT_ID))
    expect(result.current.subjectId).toBe(SUBJECT_ID)
  })

  it('fetches topics when a non-empty subjectId is provided', async () => {
    const { result } = renderHook(() => useQuizCascade())
    await act(async () => result.current.handleSubjectChange(SUBJECT_ID))
    expect(mockFetchTopicsForSubject).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result.current.topics).toEqual(TOPICS)
  })

  it('does not fetch topics when an empty string is provided', async () => {
    const { result } = renderHook(() => useQuizCascade())
    // First select a subject to get some state
    await act(async () => result.current.handleSubjectChange(SUBJECT_ID))
    // Then clear it
    await act(async () => result.current.handleSubjectChange(''))
    // fetchTopicsForSubject called only once (for first selection)
    expect(mockFetchTopicsForSubject).toHaveBeenCalledTimes(1)
    expect(result.current.topics).toEqual([])
  })

  it('resets topicId, subtopicId, topics, and subtopics when subject changes', async () => {
    const { result } = renderHook(() => useQuizCascade())

    // Populate cascade state first
    await act(async () => result.current.handleSubjectChange(SUBJECT_ID))
    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    await act(async () => result.current.setSubtopicId(SUBTOPIC_ID))

    // Change to a different subject
    await act(async () =>
      result.current.handleSubjectChange('00000000-0000-0000-0000-000000000099'),
    )

    expect(result.current.topicId).toBe('')
    expect(result.current.subtopicId).toBe('')
    expect(result.current.subtopics).toEqual([])
    // topics will be reset and then re-populated by the new fetch
  })
})

// ---- handleTopicChange ---------------------------------------------------

describe('useQuizCascade — handleTopicChange', () => {
  it('updates topicId to the new value', async () => {
    const { result } = renderHook(() => useQuizCascade())
    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    expect(result.current.topicId).toBe(TOPIC_ID)
  })

  it('fetches subtopics when a non-empty topicId is provided', async () => {
    const { result } = renderHook(() => useQuizCascade())
    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    expect(mockFetchSubtopicsForTopic).toHaveBeenCalledWith(TOPIC_ID)
    expect(result.current.subtopics).toEqual(SUBTOPICS)
  })

  it('does not fetch subtopics when an empty string is provided', async () => {
    const { result } = renderHook(() => useQuizCascade())
    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    await act(async () => result.current.handleTopicChange(''))
    expect(mockFetchSubtopicsForTopic).toHaveBeenCalledTimes(1)
    expect(result.current.subtopics).toEqual([])
  })

  it('resets subtopicId and subtopics when topic changes', async () => {
    const { result } = renderHook(() => useQuizCascade())

    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    await act(async () => result.current.setSubtopicId(SUBTOPIC_ID))

    // Make the next fetch for the new topic return empty so we can verify the reset
    mockFetchSubtopicsForTopic.mockResolvedValueOnce([])

    // Change to a different topic
    await act(async () => result.current.handleTopicChange('00000000-0000-0000-0000-000000000099'))

    expect(result.current.subtopicId).toBe('')
    expect(result.current.subtopics).toEqual([])
  })
})

// ---- setSubtopicId -------------------------------------------------------

describe('useQuizCascade — setSubtopicId', () => {
  it('updates subtopicId directly', async () => {
    const { result } = renderHook(() => useQuizCascade())
    act(() => result.current.setSubtopicId(SUBTOPIC_ID))
    expect(result.current.subtopicId).toBe(SUBTOPIC_ID)
  })
})

// ---- full cascade flow ---------------------------------------------------

describe('useQuizCascade — full cascade flow', () => {
  it('populates topics then subtopics after selecting subject then topic', async () => {
    const { result } = renderHook(() => useQuizCascade())

    await act(async () => result.current.handleSubjectChange(SUBJECT_ID))
    expect(result.current.topics).toEqual(TOPICS)
    expect(result.current.subtopics).toEqual([])

    await act(async () => result.current.handleTopicChange(TOPIC_ID))
    expect(result.current.subtopics).toEqual(SUBTOPICS)
  })
})
