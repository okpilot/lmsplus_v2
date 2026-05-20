import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { getExamConfigData } from './queries'

// ---- Fixtures ---------------------------------------------------------------

const ORG_ID = 'org-00000001'

const SUBJECT_1 = { id: 'sub-1', code: 'S1', name: 'Meteorology', short: 'MET' }
const SUBJECT_2 = { id: 'sub-2', code: 'S2', name: 'Navigation', short: 'NAV' }

const TOPIC_1 = { id: 'top-1', subject_id: 'sub-1', code: 'T1', name: 'Atmosphere' }
const TOPIC_2 = { id: 'top-2', subject_id: 'sub-2', code: 'T2', name: 'Charts' }

const SUBTOPIC_1 = { id: 'stp-1', topic_id: 'top-1', code: 'ST1', name: 'Pressure' }

const CONFIG_1 = {
  id: 'cfg-1',
  subject_id: 'sub-1',
  enabled: true,
  total_questions: 20,
  time_limit_seconds: 1200,
  pass_mark: 75,
}

const DISTRIBUTION_1 = {
  id: 'dist-1',
  exam_config_id: 'cfg-1',
  topic_id: 'top-1',
  subtopic_id: null,
  question_count: 20,
}

// Grouped row shape returned by get_question_counts RPC:
// { subject_id, topic_id, subtopic_id, n }. Two rows below put top-1 at n=2
// (1 with null subtopic + 1 with stp-1) and stp-1 at n=1.
const COUNT_ROW_TOPIC_ONLY = { subject_id: 'sub-1', topic_id: 'top-1', subtopic_id: null, n: 1 }
const COUNT_ROW_TOPIC_AND_SUBTOPIC = {
  subject_id: 'sub-1',
  topic_id: 'top-1',
  subtopic_id: 'stp-1',
  n: 1,
}

type FakeError = { message: string } | null

// ---- Chain builders ---------------------------------------------------------

/**
 * Full table dispatch — sets up mockFrom with per-table responses.
 */
function buildTableMocks({
  subjectsError = null,
  subjectsData = [SUBJECT_1, SUBJECT_2] as unknown[],
  topicsError = null,
  topicsData = [TOPIC_1, TOPIC_2] as unknown[],
  subtopicsError = null,
  subtopicsData = [SUBTOPIC_1] as unknown[],
  configsError = null,
  configsData = [CONFIG_1] as unknown[],
  distributionsError = null,
  distributionsData = [DISTRIBUTION_1] as unknown[],
  questionCountsError = null,
  questionCountsData = [COUNT_ROW_TOPIC_ONLY, COUNT_ROW_TOPIC_AND_SUBTOPIC] as unknown[],
}: {
  subjectsError?: FakeError
  subjectsData?: unknown[]
  topicsError?: FakeError
  topicsData?: unknown[]
  subtopicsError?: FakeError
  subtopicsData?: unknown[]
  configsError?: FakeError
  configsData?: unknown[]
  distributionsError?: FakeError
  distributionsData?: unknown[]
  questionCountsError?: FakeError
  questionCountsData?: unknown[]
} = {}) {
  // .order() is the terminal for easa_subjects, easa_topics, easa_subtopics
  const makeOrderChain = (data: unknown[], error: FakeError) => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  })

  // .is(null) is the last filter for exam_configs; returns a thenable
  const makeFilterChain = (data: unknown[], error: FakeError) => {
    const resolved = { data, error }
    // Make the object itself thenable so Promise.all resolves it
    const promise = Promise.resolve(resolved)
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnValue(promise),
    }
    return selectChain
  }

  // exam_config_distributions: .select() is terminal (no extra filters)
  const makeSelectChain = (data: unknown[], error: FakeError) => ({
    select: vi.fn().mockResolvedValue({ data, error }),
  })

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'easa_subjects':
        return makeOrderChain(subjectsData, subjectsError)
      case 'easa_topics':
        return makeOrderChain(topicsData, topicsError)
      case 'easa_subtopics':
        return makeOrderChain(subtopicsData, subtopicsError)
      case 'exam_configs':
        return makeFilterChain(configsData, configsError)
      case 'exam_config_distributions':
        return makeSelectChain(distributionsData, distributionsError)
      default:
        throw new Error(`Unexpected table in test: ${table}`)
    }
  })

  mockRpc.mockResolvedValue({ data: questionCountsData, error: questionCountsError })
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom, rpc: mockRpc },
    organizationId: ORG_ID,
  })
}

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getExamConfigData', () => {
  describe('happy path', () => {
    it('returns one SubjectWithConfig entry per subject', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()

      expect(mockRpc).toHaveBeenCalledWith('get_question_counts', { p_status: 'active' })
      expect(result).toHaveLength(2)
      expect(result[0]!.id).toBe('sub-1')
      expect(result[1]!.id).toBe('sub-2')
    })

    it('returns correct top-level fields for each subject', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()

      expect(result[0]!).toMatchObject({
        id: 'sub-1',
        code: 'S1',
        name: 'Meteorology',
        short: 'MET',
      })
    })

    it('attaches an ExamConfig when a config row exists for the subject', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()
      const subject1 = result[0]!

      expect(subject1.config).not.toBeNull()
      expect(subject1.config).toMatchObject({
        id: 'cfg-1',
        subjectId: 'sub-1',
        enabled: true,
        totalQuestions: 20,
        timeLimitSeconds: 1200,
        passMark: 75,
      })
    })

    it('sets config to null for subjects without a config row', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()
      const subject2 = result[1]!

      expect(subject2.config).toBeNull()
    })

    it('attaches topics to their corresponding subject', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()

      expect(result[0]!.topics).toHaveLength(1)
      expect(result[0]!.topics[0]!.id).toBe('top-1')
      expect(result[1]!.topics).toHaveLength(1)
      expect(result[1]!.topics[0]!.id).toBe('top-2')
    })

    it('attaches subtopics to their corresponding topic', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()

      const topic1 = result[0]!.topics[0]!
      expect(topic1.subtopics).toHaveLength(1)
      expect(topic1.subtopics[0]!.id).toBe('stp-1')
    })

    it('attaches distributions to the matching config', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()
      const config = result[0]!.config

      expect(config?.distributions).toHaveLength(1)
      expect(config!.distributions[0]!).toMatchObject({
        id: 'dist-1',
        topicId: 'top-1',
        questionCount: 20,
        subtopicId: null,
        subtopicCode: null,
        subtopicName: null,
      })
    })

    it('populates topicCode and topicName on distributions from the topics list', async () => {
      mockAdmin()
      buildTableMocks()

      const result = await getExamConfigData()
      const dist = result[0]!.config?.distributions[0]

      expect(dist?.topicCode).toBe('T1')
      expect(dist?.topicName).toBe('Atmosphere')
    })
  })

  describe('question counting', () => {
    it('sums n into topic availableQuestions across grouped rows', async () => {
      mockAdmin()
      // top-1 appears in two rows: n=1 (no subtopic) + n=1 (with stp-1) → total 2
      buildTableMocks({
        questionCountsData: [COUNT_ROW_TOPIC_ONLY, COUNT_ROW_TOPIC_AND_SUBTOPIC],
      })

      const result = await getExamConfigData()
      const topic1 = result[0]!.topics[0]!

      expect(topic1.availableQuestions).toBe(2)
    })

    it('sums n into subtopic availableQuestions from rows where subtopic_id is set', async () => {
      mockAdmin()
      buildTableMocks({
        questionCountsData: [COUNT_ROW_TOPIC_ONLY, COUNT_ROW_TOPIC_AND_SUBTOPIC],
      })

      const result = await getExamConfigData()
      const subtopic1 = result[0]!.topics[0]!.subtopics[0]!

      expect(subtopic1.availableQuestions).toBe(1)
    })

    it('returns zero availableQuestions when no question count rows match the topic', async () => {
      mockAdmin()
      buildTableMocks({ questionCountsData: [] })

      const result = await getExamConfigData()
      const topic1 = result[0]!.topics[0]!

      expect(topic1.availableQuestions).toBe(0)
    })

    it('uses topic-level count on a distribution when subtopic_id is null', async () => {
      mockAdmin()
      buildTableMocks({
        questionCountsData: [{ subject_id: 'sub-1', topic_id: 'top-1', subtopic_id: null, n: 2 }],
      })

      const result = await getExamConfigData()
      const dist = result[0]!.config?.distributions[0]

      // dist has subtopic_id: null so it reads topicCounts
      expect(dist?.availableQuestions).toBe(2)
    })

    it('uses subtopic-level count on a distribution when subtopic_id is set', async () => {
      mockAdmin()
      const distWithSubtopic = { ...DISTRIBUTION_1, subtopic_id: 'stp-1' }
      buildTableMocks({
        distributionsData: [distWithSubtopic],
        questionCountsData: [
          { subject_id: 'sub-1', topic_id: 'top-1', subtopic_id: 'stp-1', n: 2 },
        ],
      })

      const result = await getExamConfigData()
      const dist = result[0]!.config?.distributions[0]

      // distWithSubtopic has subtopic_id: stp-1 so it reads subtopicCounts
      expect(dist?.availableQuestions).toBe(2)
    })

    it('reflects full counts across topics totalling more than 1000 questions', async () => {
      mockAdmin()
      const topics = Array.from({ length: 5 }, (_, i) => ({
        id: `top-large-${i}`,
        subject_id: 'sub-1',
        code: `TL${i}`,
        name: `Large Topic ${i}`,
      }))
      const countRows = topics.map((t) => ({
        subject_id: 'sub-1',
        topic_id: t.id,
        subtopic_id: null,
        n: 300,
      }))
      buildTableMocks({
        topicsData: topics,
        subtopicsData: [],
        configsData: [],
        distributionsData: [],
        questionCountsData: countRows,
      })

      const result = await getExamConfigData()
      const subject1 = result[0]!

      expect(subject1.topics).toHaveLength(5)
      const total = subject1.topics.reduce((sum, t) => sum + t.availableQuestions, 0)
      expect(total).toBe(1500)
      for (const t of subject1.topics) {
        expect(t.availableQuestions).toBe(300)
      }
    })
  })

  describe('null-safe fallbacks', () => {
    it('returns empty topics array when no topics exist', async () => {
      mockAdmin()
      buildTableMocks({ topicsData: [] })

      const result = await getExamConfigData()

      expect(result[0]!.topics).toEqual([])
    })

    it('returns empty subtopics on a topic when no subtopics exist', async () => {
      mockAdmin()
      buildTableMocks({ subtopicsData: [] })

      const result = await getExamConfigData()

      expect(result[0]!.topics[0]!.subtopics).toEqual([])
    })

    it('returns empty distributions on config when no distribution rows exist', async () => {
      mockAdmin()
      buildTableMocks({ distributionsData: [] })

      const result = await getExamConfigData()

      expect(result[0]!.config?.distributions).toEqual([])
    })

    it('returns subjects with config null when configs data is null', async () => {
      mockAdmin()
      buildTableMocks({ configsData: null as unknown as unknown[] })

      const result = await getExamConfigData()

      expect(result[0]!.config).toBeNull()
      expect(result[1]!.config).toBeNull()
    })

    it('falls back to empty string for topicCode when topic is not found in topics list', async () => {
      mockAdmin()
      const orphanDist = { ...DISTRIBUTION_1, topic_id: 'top-orphan' }
      buildTableMocks({ distributionsData: [orphanDist] })

      const result = await getExamConfigData()
      const dist = result[0]!.config?.distributions[0]

      expect(dist?.topicCode).toBe('')
      expect(dist?.topicName).toBe('')
    })
  })

  describe('error propagation', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('throws a sanitized message when the subjects query fails', async () => {
      mockAdmin()
      buildTableMocks({ subjectsError: { message: 'subjects DB error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'subjects DB error',
      )
    })

    it('throws a sanitized message when the topics query fails', async () => {
      mockAdmin()
      buildTableMocks({ topicsError: { message: 'topics DB error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'topics DB error',
      )
    })

    it('throws a sanitized message when the subtopics query fails', async () => {
      mockAdmin()
      buildTableMocks({ subtopicsError: { message: 'subtopics DB error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'subtopics DB error',
      )
    })

    it('throws a sanitized message when the exam_configs query fails', async () => {
      mockAdmin()
      buildTableMocks({ configsError: { message: 'configs DB error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'configs DB error',
      )
    })

    it('throws a sanitized message when the exam_config_distributions query fails', async () => {
      mockAdmin()
      buildTableMocks({ distributionsError: { message: 'distributions DB error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'distributions DB error',
      )
    })

    it('throws a sanitized message when the question counts RPC fails', async () => {
      mockAdmin()
      buildTableMocks({ questionCountsError: { message: 'question counts RPC error' } })

      await expect(getExamConfigData()).rejects.toThrow('Failed to load exam configuration')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[getExamConfigData] DB error:',
        'question counts RPC error',
      )
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(getExamConfigData()).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
