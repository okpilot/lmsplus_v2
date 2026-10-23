// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers: getDiscoveryCounts — the per-subject, per-filter-set multiple-choice count preload. Its result for
// the seeded subject must equal what getFilteredCount (the action the form falls back to)
// returns for the Discovery defaults with the subject's full topic/subtopic ids. A short-answer
// question is seeded beside the multiple-choice ones so a dropped question-type filter shows.
// The student answers, gets wrong and flags different questions so the filter sets differ from
// n_all; for every picker subject x preloaded filter set the single get_discovery_counts read must
// equal the sum of the per-set get_filtered_question_counts reads it replaced.
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getFilteredCount } from '@/app/app/quiz/actions/lookup'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getDiscoveryCounts, sumFilteredCountRows } from '@/lib/queries/discovery-counts'
import { filterSetKey, PRELOADED_FILTER_SETS } from '@/lib/queries/filtered-count-keys'
import { getSubjectsWithCounts, getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-dcounts-${suffix}@test.local`
const password = 'test-pass-123'

let orgId: string
let studentId: string
let refs: ReferenceIds
let questionIds: string[] = []

/** q0 answered right, q1 answered wrong (card incorrect), q2 flagged, q3 untouched. */
async function seedStudentState() {
  const [q0, q1, q2] = questionIds
  const responses = [
    { question_id: q0, is_correct: true },
    { question_id: q1, is_correct: false },
  ].map((r) => ({
    ...r,
    student_id: studentId,
    organization_id: orgId,
    selected_option_id: 'b',
    response_time_ms: 1000,
  }))
  const { error: respErr } = await admin.from('student_responses').insert(responses)
  if (respErr) throw new Error(`student_responses insert: ${respErr.message}`)
  const { error: cardErr } = await admin
    .from('fsrs_cards')
    .insert({ student_id: studentId, question_id: q1, last_was_correct: false })
  if (cardErr) throw new Error(`fsrs_cards insert: ${cardErr.message}`)
  const { error: flagErr } = await admin
    .from('flagged_questions')
    .insert({ student_id: studentId, question_id: q2 })
  if (flagErr) throw new Error(`flagged_questions insert: ${flagErr.message}`)
}

describe('getDiscoveryCounts (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-dcounts ${suffix}`,
      slug: `int-dcounts-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `S${suffix}`,
      subjectName: `DCounts Subject ${suffix}`,
      topicCode: `T${suffix}`,
      topicName: `DCounts Topic ${suffix}`,
      subtopicCode: `ST${suffix}`,
      subtopicName: `DCounts Subtopic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 4,
    })
    const { bankId } = seeded
    questionIds = seeded.questionIds
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: refs.subtopicId ?? null,
      difficulty: 'medium',
      status: 'active',
      created_by: studentId,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: 'MAYDAY',
      explanation_text: 'SA explanation',
    })
    if (error) throw new Error(`short_answer insert: ${error.message}`)
    await seedStudentState()
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      // flagged_questions FK-references questions; cleanupTestData does not clear it.
      const { error } = await admin.from('flagged_questions').delete().eq('student_id', studentId)
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`flagged_questions: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('counts only the multiple-choice questions of the seeded subject', async () => {
    await signInAs(email, password)

    const counts = await getDiscoveryCounts()
    const none = counts[refs.subjectId]?.['']

    expect(none?.count).toBe(4)
    expect(none?.byTopic[refs.topicId]).toBe(4)
    expect(none?.bySubtopic[refs.subtopicId ?? '']).toBe(4)
  })

  it.each([
    { label: 'no filter', filters: [] as string[] },
    { label: 'unseen', filters: ['unseen'] },
    { label: 'incorrect and flagged', filters: ['incorrect', 'flagged'] },
  ])(
    'equals the per-subject count action for $label with the full topic ids',
    async ({ filters }) => {
      await signInAs(email, password)
      const tree = await getTopicsWithSubtopics(refs.subjectId)
      expect(tree.length).toBeGreaterThan(0)

      const counts = await getDiscoveryCounts()
      const fromAction = await getFilteredCount({
        subjectId: refs.subjectId,
        topicIds: tree.map((t) => t.id),
        subtopicIds: tree.flatMap((t) => t.subtopics.map((st) => st.id)),
        filters: filters.length ? filters : ['all'],
        calcMode: 'all',
        imageMode: 'all',
        questionType: 'multiple_choice',
      })

      expect(counts[refs.subjectId]?.[filterSetKey(filters)]).toEqual({
        count: fromAction.count,
        byTopic: fromAction.byTopic,
        bySubtopic: fromAction.bySubtopic,
      })
    },
  )

  it('splits the seeded student pool by answered, wrong and flagged questions', async () => {
    await signInAs(email, password)

    const sets = (await getDiscoveryCounts())[refs.subjectId]

    expect(sets?.unseen?.count).toBe(2)
    expect(sets?.incorrect?.count).toBe(1)
    expect(sets?.flagged?.count).toBe(1)
    expect(sets?.['flagged,incorrect']?.count).toBe(2)
  })

  it('equals the summed per-set count RPC for every picker subject and filter set', async () => {
    await signInAs(email, password)
    const supabase = await createServerSupabaseClient()
    const subjects = await getSubjectsWithCounts()
    expect(subjects.some((s) => s.id === refs.subjectId)).toBe(true)

    const counts = await getDiscoveryCounts()

    for (const subject of subjects) {
      const tree = await getTopicsWithSubtopics(subject.id)
      if (tree.length === 0) continue
      for (const filters of PRELOADED_FILTER_SETS) {
        const { data, error } = await supabase.rpc('get_filtered_question_counts', {
          p_subject_id: subject.id,
          p_topic_ids: tree.map((t) => t.id),
          p_subtopic_ids: tree.flatMap((t) => t.subtopics.map((st) => st.id)),
          p_filters: [...filters],
          p_calc_mode: 'all',
          p_has_image: 'all',
          p_question_type: 'multiple_choice',
        })
        expect(error).toBeNull()
        expect(Array.isArray(data)).toBe(true)
        expect(counts[subject.id]?.[filterSetKey(filters)]).toEqual(
          sumFilteredCountRows(Array.isArray(data) ? data : []),
        )
      }
    }
  })
})
