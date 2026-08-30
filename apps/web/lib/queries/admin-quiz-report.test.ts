import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: { from: mockAdminFrom },
}))

// ---- Subject under test -----------------------------------------------------

import { getAdminQuizReportQuestions, getAdminQuizReportSummary } from './admin-quiz-report'
import type { QuizReportQuestion } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'

// Admin reports are mostly MC; narrow the discriminated union to the MC variant
// so the type-specific MC fields (options, correctOptionId) are accessible.
function asMc(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'multiple_choice') {
    throw new Error('expected a multiple_choice report question')
  }
  return q
}

// Narrow to the non-MC variants exercised by #991's fix (question_type now
// reaches the builder for the admin feed).
function asShortAnswer(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'short_answer') {
    throw new Error('expected a short_answer report question')
  }
  return q
}
function asDialog(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'dialog_fill') {
    throw new Error('expected a dialog_fill report question')
  }
  return q
}
function asOrdering(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'ordering') {
    throw new Error('expected an ordering report question')
  }
  return q
}
function asDiagramLabel(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'diagram_label') {
    throw new Error('expected a diagram_label report question')
  }
  return q
}

// ---- Helpers -----------------------------------------------------------------

const DEFAULT_ORG_ID = 'org-1'
const mockAuthRpc = vi.hoisted(() => vi.fn())

function makeAdminContext(overrides: Partial<{ organizationId: string }> = {}) {
  return {
    supabase: { rpc: mockAuthRpc } as unknown,
    userId: 'admin-1',
    organizationId: DEFAULT_ORG_ID,
    ...overrides,
  }
}

/**
 * Builds a fluent chain stub for adminClient.from() chains.
 * Every builder method returns the same chain; awaiting resolves with returnValue.
 * `onSelect` (optional) is invoked with the exact args passed to `.select(...)` on this
 * chain — used to assert the select STRING itself, since the mock is otherwise blind to
 * which columns a query asked for (only the queued fixture drives what comes back).
 * `onIn` (optional) is the same capture for `.in(...)` — used to assert the exact id list a
 * page-boundary query filtered on, since the mock otherwise returns whichever fixture was
 * queued regardless of which ids were actually requested.
 */
function buildChain(
  returnValue: unknown,
  onSelect?: (args: unknown[]) => void,
  onIn?: (args: unknown[]) => void,
) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const terminalProxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      if (prop === 'select') {
        return (...args: unknown[]) => {
          onSelect?.(args)
          return terminalProxy
        }
      }
      if (prop === 'in') {
        return (...args: unknown[]) => {
          onIn?.(args)
          return terminalProxy
        }
      }
      return (..._args: unknown[]) => terminalProxy
    },
  })
  return terminalProxy
}

/**
 * Queues one buildChain() response per adminClient.from() call, in order. Returns the args
 * passed to `.select(...)` and `.in(...)` on each chain, indexed by call order — so a test can
 * assert on the select STRING or the filtered id LIST of a specific `.from()` call (e.g. the
 * questions query), not just on the fixture it was handed back.
 */
function mockFromSequence(...responses: unknown[]): {
  selectArgsByCall: unknown[][]
  inArgsByCall: unknown[][]
} {
  let call = 0
  const selectArgsByCall: unknown[][] = []
  const inArgsByCall: unknown[][] = []
  mockAdminFrom.mockImplementation(() => {
    const idx = call++
    return buildChain(
      responses[idx] ?? { data: null },
      (args) => {
        selectArgsByCall[idx] = args
      },
      (args) => {
        inArgsByCall[idx] = args
      },
    )
  })
  return { selectArgsByCall, inArgsByCall }
}

// ---- Fixtures ---------------------------------------------------------------

const completedSession = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null as string | null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:15:00Z',
  total_questions: 5,
  correct_count: 3,
  score_percentage: 60,
  student_id: 'stu-1',
}

const answersData = [
  { question_id: 'q1', selected_option_id: 'opt-a', is_correct: true, response_time_ms: 2000 },
  { question_id: 'q2', selected_option_id: 'opt-c', is_correct: false, response_time_ms: 4500 },
]

const questionsData = [
  {
    id: 'q1',
    question_text: 'What is lift?',
    question_number: '050-01-001',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanation_text: 'Lift acts upward.',
    explanation_image_url: null,
    question_image_url: null,
  },
  {
    id: 'q2',
    question_text: 'What is drag?',
    question_number: '050-01-002',
    options: [
      { id: 'opt-c', text: 'Forward force' },
      { id: 'opt-d', text: 'Opposing force' },
    ],
    explanation_text: null,
    explanation_image_url: null,
    question_image_url: null,
  },
]

const correctOptionsData = [
  { question_id: 'q1', correct_option_id: 'opt-a' },
  { question_id: 'q2', correct_option_id: 'opt-d' },
]

// The order-rows page fetched by fetchAllRows() for the answers/questions endpoint —
// distinct question_ids matching answersData/questionsData above.
const orderRowsQ1Q2 = [{ question_id: 'q1' }, { question_id: 'q2' }]

// 5 distinct order rows — used by the page-out-of-range/zero/negative tests, where
// `total` must reflect 5 DISTINCT questions (derived from the page fetch, not the count).
const fiveOrderRows = Array.from({ length: 5 }, (_, i) => ({ question_id: `q${i + 1}` }))

// 4 distinct answer rows for the summary's answer-rows fetchAllRows page — used wherever
// a summary test needs the count/page pair but doesn't assert the exact counts.
const fourAnswerRows = [
  { question_id: 'q1' },
  { question_id: 'q2' },
  { question_id: 'q3' },
  { question_id: 'q4' },
]

// ---- Tests -----------------------------------------------------------------

// ---------------------------------------------------------------------------
// getAdminQuizReportSummary
// ---------------------------------------------------------------------------

describe('getAdminQuizReportSummary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns null when session does not exist in org', async () => {
    // session query returns null
    mockFromSequence({ data: null })
    const result = await getAdminQuizReportSummary('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when session is still active to prevent mid-session answer exposure', async () => {
    const activeSession = { ...completedSession, ended_at: null }
    mockFromSequence({ data: activeSession })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).toBeNull()
  })

  it('does not query answers or users when session has no ended_at', async () => {
    const activeSession = { ...completedSession, ended_at: null }
    mockFromSequence({ data: activeSession })
    await getAdminQuizReportSummary('sess-1')
    // Only the session query should have fired
    expect(mockAdminFrom).toHaveBeenCalledTimes(1)
  })

  it('returns summary with all fields for a completed session', async () => {
    // session, answer-rows count, answer-rows page (fetchAllRows), users lookup
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('sess-1')
    expect(result!.mode).toBe('quick_quiz')
    expect(result!.totalQuestions).toBe(5)
    expect(result!.answeredItems).toBe(4)
    expect(result!.answeredQuestions).toBe(4)
    expect(result!.correctCount).toBe(3)
    expect(result!.scorePercentage).toBe(60)
    expect(result!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(result!.endedAt).toBe('2026-03-12T10:15:00Z')
    expect(result!.studentId).toBe('stu-1')
  })

  it('counts answer rows and distinct questions separately when a question has multiple answer rows', async () => {
    // q1 appears twice (e.g. a 2-blank dialog_fill), q2 once → 3 items, 2 distinct questions.
    const rows = [{ question_id: 'q1' }, { question_id: 'q1' }, { question_id: 'q2' }]
    mockFromSequence(
      { data: completedSession },
      { count: 3, data: null },
      { data: rows, error: null },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.answeredItems).toBe(3)
    expect(result!.answeredQuestions).toBe(2)
  })

  it('includes studentName resolved from users table', async () => {
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.studentName).toBe('Alice')
  })

  it('falls back to null studentName when user lookup returns null', async () => {
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: null },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.studentName).toBeNull()
  })

  it('falls back to null studentName when user lookup returns an error', async () => {
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: null, error: { message: 'row not found' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.studentName).toBeNull()
  })

  it('resolves subjectName when subject_id is present', async () => {
    const sessionWithSubject = { ...completedSession, subject_id: 'sub-1' }
    // session, answer-rows count, answer-rows page, subject lookup, users lookup
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: { name: 'Meteorology', code: 'MET' } },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.subjectName).toBe('Meteorology')
    expect(result!.subjectCode).toBe('MET')
  })

  it('falls back to null subjectName when subject lookup fails', async () => {
    const sessionWithSubject = { ...completedSession, subject_id: 'sub-1' }
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: null, error: { message: 'relation not found' } },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.subjectName).toBeNull()
    expect(result!.subjectCode).toBeNull()
  })

  it('falls back to 0 scorePercentage when session score_percentage is null', async () => {
    const sessionNullScore = { ...completedSession, score_percentage: null }
    mockFromSequence(
      { data: sessionNullScore },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: null },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.scorePercentage).toBe(0)
  })

  it('reports zero answered items when the count is null rather than the question total', async () => {
    // A null count must NOT fall back to total_questions: that is a QUESTION-level value, and
    // feeding it to answeredItems makes the report divide an item-level correct_count by a
    // question count again — the scale mix Decision 60 removed. 0 routes the report to an em
    // dash instead, which reads as a failed count rather than a fabricated one.
    // count: null → fetchAllRows sees total=0 and never issues a page fetch, so only the
    // session, count, and users queries fire (3 calls, no page entry needed).
    mockFromSequence({ data: completedSession }, { count: null, data: null }, { data: null })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.answeredItems).toBe(0)
    expect(result!.answeredQuestions).toBe(0)
    expect(result!.answeredItems).not.toBe(completedSession.total_questions)
  })

  it('returns null when the answered-count query returns an error', async () => {
    // A count-level error short-circuits fetchAllRows before any page fetch is attempted.
    mockFromSequence(
      { data: completedSession },
      { count: null, data: null, error: { message: 'count query failed' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).toBeNull()
  })

  it('returns null when the answer-rows page fetch fails after a successful count', async () => {
    // code-style.md "Paginated Fetch Needs a Caller-Level Page-Error Test": fetchAllRows
    // discards partial pages on a page-level error, so a caller that failed to check the
    // returned `error` would treat this as a legitimate empty result (0 answered) instead of
    // a failure — a silently-truncated summary. The count succeeds (non-zero) so the loop
    // actually reaches the page fetch, which then fails.
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: null, error: { message: 'answer rows page fetch failed' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).toBeNull()
    // Only the session, count, and failed page query fired — no users/subject lookup after.
    expect(mockAdminFrom).toHaveBeenCalledTimes(3)
  })

  it('coerces string wire value for score_percentage to number', async () => {
    // PostgREST serialises NUMERIC as a JSON string; verify coercion to number.
    const sessionWithStringScore = { ...completedSession, score_percentage: '73.33' }
    mockFromSequence(
      { data: sessionWithStringScore },
      { count: 4, data: null },
      { data: fourAnswerRows, error: null },
      { data: null },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.scorePercentage).toBe(73.33)
    expect(typeof result!.scorePercentage).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// getAdminQuizReportQuestions
// ---------------------------------------------------------------------------

describe('getAdminQuizReportQuestions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns error when sessionId is empty', async () => {
    const result = await getAdminQuizReportQuestions({ sessionId: '', page: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Failed to load questions')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('returns error when session does not exist in org', async () => {
    mockFromSequence({ data: null })
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when session verification query fails', async () => {
    mockFromSequence({ data: null, error: { message: 'db connection lost' } })
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Failed to load questions')
    expect(mockAdminFrom).toHaveBeenCalledTimes(1)
  })

  it('returns error when session is still active to prevent mid-session answer exposure', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('does not query answers or questions when session has no ended_at', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    // Only the session guard query should have fired
    expect(mockAdminFrom).toHaveBeenCalledTimes(1)
  })

  it('returns error when count query fails', async () => {
    // A count-level error short-circuits fetchAllRows before any page fetch is attempted.
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: null, error: { message: 'db error' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when the order-rows page fetch fails after a successful count', async () => {
    // code-style.md "Paginated Fetch Needs a Caller-Level Page-Error Test": the count query
    // (5 distinct questions) succeeds, so fetchAllRows proceeds to the page fetch, which then
    // fails. fetchAllRows discards the partial page and returns `{ data: [], error }` — an
    // uncaught regression here would read as "0 distinct questions" (ok:true, empty) instead
    // of surfacing the failure, silently truncating the report.
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 5, data: null },
      { data: null, error: { message: 'order rows page fetch failed' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Failed to load questions')
    // Only the session guard, count, and failed page query fired — no answers/questions fetch.
    expect(mockAdminFrom).toHaveBeenCalledTimes(3)
  })

  it('returns ok:true with empty questions when no answers exist', async () => {
    // count: 0 → fetchAllRows never issues a page fetch (total=0), so no order-rows entry
    // is needed here.
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 0, data: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('returns ok:true with empty questions when page exceeds total pages', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 5, data: null },
      { data: fiveOrderRows, error: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 99 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns ok:true with empty questions when page is zero', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 5, data: null },
      { data: fiveOrderRows, error: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns ok:true with empty questions when page is negative', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 5, data: null },
      { data: fiveOrderRows, error: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: -3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns paginated questions with correct totalCount', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('filters the answers and questions queries to all PAGE_SIZE ids when the session has exactly PAGE_SIZE questions', async () => {
    // Boundary: pageQuestionIds = orderedQuestionIds.slice(0, PAGE_SIZE). With total === PAGE_SIZE
    // this must filter on every question id, not drop the last one or spill onto a page 2.
    // Asserts the actual `.in(...)` id LIST, not just the returned report length — the mocked
    // client returns whichever fixture is queued regardless of what `.in()` was called with, so
    // a length-only assertion here cannot distinguish correct slicing from a broken one; only
    // capturing the real `.in()` argument pins the slice boundary itself.
    const tenOrderRows = Array.from({ length: PAGE_SIZE }, (_, i) => ({ question_id: `q${i + 1}` }))
    const allTenIds = tenOrderRows.map((r) => r.question_id)
    const { inArgsByCall } = mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: PAGE_SIZE, data: null },
      { data: tenOrderRows, error: null },
      // Non-empty: an empty answers array short-circuits the function before the questions
      // query ever fires (`if (!answers.length) return ...`), which would make inArgsByCall[4]
      // undefined regardless of the slice mechanism under test.
      {
        data: [
          { question_id: 'q1', selected_option_id: null, is_correct: true, response_time_ms: 0 },
        ],
      },
      { data: [] },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    // Call order: session(0), order-rows count(1), order-rows page(2), answers(3), questions(4).
    expect(inArgsByCall[3]).toEqual(['question_id', allTenIds])
    expect(inArgsByCall[4]).toEqual(['id', allTenIds])
  })

  it('filters the answers and questions queries to only the overflow id on the second page when the session has one more than PAGE_SIZE questions', async () => {
    // Boundary: with total = PAGE_SIZE + 1, page 2's slice is
    // orderedQuestionIds.slice(PAGE_SIZE, 2*PAGE_SIZE), which must filter on exactly the 11th
    // question id. An off-by-one in `from` (e.g. page*PAGE_SIZE) would slice past the array and
    // filter on zero ids instead of one; an off-by-one the other way would filter on two.
    const elevenOrderRows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      question_id: `q${i + 1}`,
    }))
    const { inArgsByCall } = mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: PAGE_SIZE + 1, data: null },
      { data: elevenOrderRows, error: null },
      // Non-empty for the same reason as the page-1 boundary test above.
      {
        data: [
          { question_id: 'q11', selected_option_id: null, is_correct: true, response_time_ms: 0 },
        ],
      },
      { data: [] },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 2 })

    // Call order: session(0), order-rows count(1), order-rows page(2), answers(3), questions(4).
    expect(inArgsByCall[3]).toEqual(['question_id', ['q11']])
    expect(inArgsByCall[4]).toEqual(['id', ['q11']])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalCount).toBe(PAGE_SIZE + 1)
  })

  it('maps question fields correctly for a correct answer', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q1 = asMc(result.questions[0])
    expect(q1.questionId).toBe('q1')
    expect(q1.questionText).toBe('What is lift?')
    expect(q1.questionNumber).toBe('050-01-001')
    expect(q1.isCorrect).toBe(true)
    expect(q1.selectedOptionId).toBe('opt-a')
    expect(q1.correctOptionId).toBe('opt-a')
    expect(q1.options).toEqual([
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ])
    expect(q1.explanationText).toBe('Lift acts upward.')
    expect(q1.explanationImageUrl).toBeNull()
    expect(q1.responseTimeMs).toBe(2000)
  })

  it('identifies incorrect answers with the correct option from the RPC', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q2 = asMc(result.questions[1])
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns error when answers query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: null, error: { message: 'answers query failed' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when questions query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: null, error: { message: 'questions query failed' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when correct-options RPC fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    // Correct-options RPC fails → the function returns before ever calling the
    // answer-keys RPC, so only ONE resolution is queued.
    mockAuthRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns an error when the answer-keys RPC fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: null, error: { message: 'keys rpc failed' } })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result).toEqual({ ok: false, error: 'Failed to load questions' })
  })

  it('calls the RPC with get_admin_report_correct_options and the session id', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(mockAuthRpc).toHaveBeenCalledWith('get_admin_report_correct_options', {
      p_session_id: 'sess-1',
    })
  })

  it('does not call the RPC when the page has no answers', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 0, data: null },
    )
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockAuthRpc).not.toHaveBeenCalled()
  })

  it('falls back to empty string correctOptionId when RPC returns no match', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q1' }], error: null },
      { data: [answersData[0]] },
      { data: [questionsData[0]] },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(asMc(result.questions[0]).correctOptionId).toBe('')
  })

  it('handles missing question data gracefully with fallback empty values', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q1' }], error: null },
      { data: [answersData[0]] },
      { data: [] }, // no questions found in DB
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = asMc(result.questions[0])
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.options).toEqual([])
    expect(q.correctOptionId).toBe('')
  })

  it('includes explanationImageUrl when present on the question', async () => {
    const questionsWithImage = [
      {
        ...questionsData[0],
        explanation_image_url: 'https://cdn.example.com/lift.png',
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q1' }], error: null },
      { data: [answersData[0]] },
      { data: questionsWithImage },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]], error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.explanationImageUrl).toBe('https://cdn.example.com/lift.png')
  })

  it('uses the same PAGE_SIZE as the student quiz report', () => {
    expect(PAGE_SIZE).toBe(10)
  })

  // -------------------------------------------------------------------------
  // #991: the admin session report must render non-MC sessions correctly —
  // question_type now reaches the builder, and the new answer-keys RPC delivers
  // non-MC canonicals.
  // -------------------------------------------------------------------------

  it('surfaces the question_type fetched from the questions table instead of defaulting to multiple_choice', async () => {
    // Non-vacuous: the builder's fallback for a MISSING question_type is
    // 'multiple_choice' (report-question-builder.ts), so asserting 'short_answer'
    // here only passes if the column was actually fetched and threaded through.
    const saAnswers = [
      {
        question_id: 'q5',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 1500,
        response_text: 'mayday mayday mayday',
      },
    ]
    const saQuestion = {
      id: 'q5',
      question_text: 'What do you transmit in a distress call?',
      question_number: '092-01-001',
      question_type: 'short_answer',
      options: [],
      explanation_text: null,
      explanation_image_url: null,
      question_image_url: null,
    }
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q5' }], error: null },
      { data: saAnswers },
      { data: [saQuestion] },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({
      data: [
        {
          question_id: 'q5',
          question_type: 'short_answer',
          blank_index: null,
          answer_key: 'mayday mayday mayday',
        },
      ],
      error: null,
    })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]?.questionType).not.toBe('multiple_choice')
    const q = asShortAnswer(result.questions[0])
    expect(q.responseText).toBe('mayday mayday mayday')
    expect(q.canonicalAnswer).toBe('mayday mayday mayday')
    expect(q.isCorrect).toBe(true)
  })

  it('requests the question type so non-MC questions are not mis-rendered as multiple choice', async () => {
    // Asserts the SELECT STRING itself, not just the builder's output: the mocked client
    // returns whichever fixture is queued regardless of what columns were asked for, so a
    // test that only inspects the returned QuizReportQuestion cannot prove the query asked
    // for question_type — it only proves the builder consumes a type it was handed. Dropping
    // `question_type` from the real select is #991's central defect and is otherwise
    // invisible to every other assertion in this suite.
    const { selectArgsByCall } = mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    // Call order: session(0), order-rows count(1), order-rows page(2), answers(3), questions(4).
    const questionsSelectArg = selectArgsByCall[4]?.[0]
    expect(typeof questionsSelectArg).toBe('string')
    expect(questionsSelectArg as string).toContain('question_type')
  })

  it('requests response_text and blank_index on the answers query so non-MC answers are not dropped', async () => {
    // Same rationale as the question_type test above: the returned report only proves the
    // builder handled the fields it was given, not that the query asked for them. Dropping
    // either column from the real select silently produces null response_text/blank_index
    // for every non-MC answer, which no other test in this suite would catch.
    const { selectArgsByCall } = mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: orderRowsQ1Q2, error: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    // Call order: session(0), order-rows count(1), order-rows page(2), answers(3), questions(4).
    const answersSelectArg = selectArgsByCall[3]?.[0]
    expect(typeof answersSelectArg).toBe('string')
    expect(answersSelectArg as string).toContain('response_text')
    expect(answersSelectArg as string).toContain('blank_index')
  })

  it('collapses a multi-blank dialog question into one entry and counts it once toward the total', async () => {
    // Mixed: one MC (q1) + one 3-blank dialog_fill (q2). The dialog's 3 answer
    // rows must collapse to ONE report entry, and totalCount must count distinct
    // questions (2), not rows (4).
    const mixedOrderRows = [{ question_id: 'q1' }, { question_id: 'q2' }]
    const mixedAnswers = [
      {
        question_id: 'q1',
        selected_option_id: 'opt-a',
        is_correct: true,
        response_time_ms: 3000,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 4000,
        response_text: 'cleared',
        blank_index: 0,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 4000,
        response_text: 'wrong',
        blank_index: 1,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 4000,
        response_text: 'roger',
        blank_index: 2,
      },
    ]
    const mixedQuestions = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        question_type: 'multiple_choice',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: null,
        explanation_image_url: null,
        question_image_url: null,
      },
      {
        id: 'q2',
        question_text: 'Fill the readback',
        question_number: '092-02-001',
        question_type: 'dialog_fill',
        options: [],
        explanation_text: null,
        explanation_image_url: null,
        question_image_url: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: mixedOrderRows, error: null },
      { data: mixedAnswers },
      { data: mixedQuestions },
    )
    mockAuthRpc.mockResolvedValueOnce({
      data: [{ question_id: 'q1', correct_option_id: 'opt-a' }],
      error: null,
    })
    mockAuthRpc.mockResolvedValueOnce({
      data: [
        { question_id: 'q2', question_type: 'dialog_fill', blank_index: 0, answer_key: 'cleared' },
        { question_id: 'q2', question_type: 'dialog_fill', blank_index: 1, answer_key: 'climb' },
        { question_id: 'q2', question_type: 'dialog_fill', blank_index: 2, answer_key: 'roger' },
      ],
      error: null,
    })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 distinct questions, not 4 answer rows.
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    const dialog = asDialog(result.questions[1])
    expect(dialog.blanks).toHaveLength(3)
    expect(dialog.correctCount).toBe(2)
    expect(dialog.totalBlanks).toBe(3)
    expect(dialog.isCorrect).toBe(false)
    // Per-blank canonical surfaces for the wrong blank.
    expect(dialog.blanks[1]?.canonical).toBe('climb')
  })

  it('surfaces per-slot canonicals for an ordering question from the answer-keys RPC', async () => {
    const orderingAnswers = [
      {
        question_id: 'q3',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 2000,
        response_text: 'Flaps',
        blank_index: 0,
      },
      {
        question_id: 'q3',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 2000,
        response_text: 'Gear',
        blank_index: 1,
      },
    ]
    const orderingQuestion = {
      id: 'q3',
      question_text: 'Order the pre-landing checklist',
      question_number: '060-01-001',
      question_type: 'ordering',
      options: [],
      explanation_text: null,
      explanation_image_url: null,
      question_image_url: null,
    }
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q3' }], error: null },
      { data: orderingAnswers },
      { data: [orderingQuestion] },
    )
    // No MC questions on this page — correct-options RPC returns no rows.
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({
      data: [
        { question_id: 'q3', question_type: 'ordering', blank_index: 0, answer_key: 'Flaps' },
        { question_id: 'q3', question_type: 'ordering', blank_index: 1, answer_key: 'Trim' },
      ],
      error: null,
    })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ordering = asOrdering(result.questions[0])
    expect(ordering.slots).toHaveLength(2)
    expect(ordering.totalItems).toBe(2)
    expect(ordering.correctCount).toBe(1)
    // The canonical for the wrong slot comes from the answer-keys RPC, not the response.
    expect(ordering.slots.find((s) => s.position === 1)?.canonicalText).toBe('Trim')
  })

  it('surfaces per-zone correct labels for a diagram_label question from the answer-keys RPC', async () => {
    // diagram_label rides the SAME get_admin_report_answer_keys RPC as short_answer/dialog_fill/
    // ordering, but only the ordering branch had an end-to-end test at this query-function
    // level (quiz-report-helpers.test.ts covers buildAnswerKeyMap's diagram_label branch in
    // isolation, and report-diagram-label-helpers.test.ts covers buildDiagram in isolation —
    // neither proves admin-quiz-report.ts threads the RPC result through correctly).
    const diagramAnswers = [
      {
        question_id: 'q8',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 3000,
        response_text: 'Upwind',
        blank_index: 0,
      },
      {
        question_id: 'q8',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 3000,
        response_text: 'Base',
        blank_index: 1,
      },
    ]
    const diagramQuestion = {
      id: 'q8',
      question_text: 'Label the traffic pattern legs',
      question_number: '092-04-001',
      question_type: 'diagram_label',
      options: [],
      explanation_text: null,
      explanation_image_url: null,
      question_image_url: null,
    }
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [{ question_id: 'q8' }], error: null },
      { data: diagramAnswers },
      { data: [diagramQuestion] },
    )
    // No MC questions on this page — correct-options RPC returns no rows.
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })
    mockAuthRpc.mockResolvedValueOnce({
      data: [
        {
          question_id: 'q8',
          question_type: 'diagram_label',
          blank_index: 0,
          answer_key: 'Upwind',
        },
        {
          question_id: 'q8',
          question_type: 'diagram_label',
          blank_index: 1,
          answer_key: 'Crosswind',
        },
      ],
      error: null,
    })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diagram = asDiagramLabel(result.questions[0])
    expect(diagram.zones).toHaveLength(2)
    expect(diagram.totalZones).toBe(2)
    expect(diagram.correctCount).toBe(1)
    expect(diagram.isCorrect).toBe(false)
    // The correct label for the wrongly-placed zone comes from the answer-keys RPC, not the response.
    expect(diagram.zones.find((z) => z.blankIndex === 1)?.correctLabel).toBe('Crosswind')
  })
})
