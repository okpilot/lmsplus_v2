/**
 * Additive seed for the single-active-session invariant manual eval (PR #1020 / #1011).
 *
 * The base seed (`seed-quiz-setup-eval.ts`) seeds subjects/questions/drafts but
 * NEITHER an enabled exam_config NOR a lingering active practice session. This
 * script adds exactly those two things so the eval can exercise:
 *   - Discovery -> Practice-Exam blocking (needs an enabled, STARTABLE exam_config)
 *   - ActivePracticeBanner server-side recovery (needs a pre-seeded active
 *     quick_quiz quiz_sessions row)
 *
 * Run AFTER the base seed:
 *   cd apps/web
 *   npx tsx scripts/seed-quiz-setup-eval.ts
 *   npx tsx scripts/seed-1011-eval.ts
 *
 * Idempotent: upserts the exam_config, replaces its distributions, and soft-deletes
 * any pre-existing active session for the student before inserting exactly one
 * (the single-active unique index forbids a second active row).
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !process.argv.includes('--force-remote')) {
  console.error(
    `Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}\nPass --force-remote to override.`,
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_SLUG = 'egmont-aviation'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

// MET (050) gets the Practice Exam; ALW (010) gets the lingering practice session
// (a DIFFERENT subject so the cross-subject block is genuinely exercised).
const EXAM_SUBJECT_CODE = '050'
const PRACTICE_SUBJECT_CODE = '010'

const EXAM_TOTAL_QUESTIONS = 10
const EXAM_TIME_LIMIT_SECONDS = 600
const EXAM_PASS_MARK = 75

type SubtopicAvail = {
  topicId: string
  topicCode: string
  subtopicId: string
  subtopicCode: string
  available: number
}

async function findOrgId(): Promise<string> {
  const { data, error } = await db.from('organizations').select('id').eq('slug', ORG_SLUG).single()
  if (error || !data) throw new Error(`Org '${ORG_SLUG}' not found — run the base seed first.`)
  return data.id
}

async function findStudentId(): Promise<string> {
  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === STUDENT_EMAIL)
  if (!existing) throw new Error(`Student '${STUDENT_EMAIL}' not found — run the base seed first.`)
  return existing.id
}

async function findSubjectId(code: string): Promise<string> {
  const { data, error } = await db.from('easa_subjects').select('id').eq('code', code).single()
  if (error || !data) throw new Error(`Subject '${code}' not found — run the base seed first.`)
  return data.id
}

// For each subtopic of the subject, count its ACTIVE, non-deleted questions in this org.
async function subtopicAvailability(orgId: string, subjectId: string): Promise<SubtopicAvail[]> {
  const { data: topics, error: topErr } = await db
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', subjectId)
  if (topErr) throw new Error(`Topics: ${topErr.message}`)

  const result: SubtopicAvail[] = []
  for (const topic of topics ?? []) {
    const { data: subs, error: subErr } = await db
      .from('easa_subtopics')
      .select('id, code')
      .eq('topic_id', topic.id)
    if (subErr) throw new Error(`Subtopics: ${subErr.message}`)

    for (const sub of subs ?? []) {
      const { count, error: cErr } = await db
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('subject_id', subjectId)
        .eq('topic_id', topic.id)
        .eq('subtopic_id', sub.id)
        .eq('status', 'active')
        .is('deleted_at', null)
      if (cErr) throw new Error(`Question count (${sub.code}): ${cErr.message}`)
      result.push({
        topicId: topic.id,
        topicCode: topic.code,
        subtopicId: sub.id,
        subtopicCode: sub.code,
        available: count ?? 0,
      })
    }
  }
  return result
}

// Greedily build distribution rows summing to EXACTLY total, never exceeding any
// subtopic's available active-question count.
function buildDistribution(
  avail: SubtopicAvail[],
  total: number,
): { topicId: string; subtopicId: string; count: number; subtopicCode: string }[] {
  const rows: { topicId: string; subtopicId: string; count: number; subtopicCode: string }[] = []
  let remaining = total
  for (const a of avail) {
    if (remaining <= 0) break
    if (a.available <= 0) continue
    const take = Math.min(a.available, remaining)
    rows.push({
      topicId: a.topicId,
      subtopicId: a.subtopicId,
      count: take,
      subtopicCode: a.subtopicCode,
    })
    remaining -= take
  }
  if (remaining > 0) {
    const totalAvail = avail.reduce((s, a) => s + a.available, 0)
    throw new Error(
      `Not enough active questions to build a ${total}-question exam: only ${totalAvail} available across subtopics.`,
    )
  }
  return rows
}

async function seedExamConfig(orgId: string, examSubjectId: string) {
  const avail = await subtopicAvailability(orgId, examSubjectId)
  const dist = buildDistribution(avail, EXAM_TOTAL_QUESTIONS)

  // Look up existing config (UNIQUE on organization_id, subject_id), then update
  // or insert. Avoids relying on PostgREST ON CONFLICT inference.
  const payload = {
    enabled: true,
    total_questions: EXAM_TOTAL_QUESTIONS,
    time_limit_seconds: EXAM_TIME_LIMIT_SECONDS,
    pass_mark: EXAM_PASS_MARK,
    deleted_at: null,
  }
  const { data: existing } = await db
    .from('exam_configs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('subject_id', examSubjectId)
    .maybeSingle()

  let cfg: { id: string }
  if (existing) {
    const { data: updated, error: updErr } = await db
      .from('exam_configs')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (updErr || !updated) throw new Error(`exam_config update: ${updErr?.message}`)
    cfg = updated
  } else {
    const { data: inserted, error: insCfgErr } = await db
      .from('exam_configs')
      .insert({ organization_id: orgId, subject_id: examSubjectId, ...payload })
      .select('id')
      .single()
    if (insCfgErr || !inserted) throw new Error(`exam_config insert: ${insCfgErr?.message}`)
    cfg = inserted
  }

  // Replace distributions (idempotent): delete existing, then insert fresh.
  const { error: delErr } = await db
    .from('exam_config_distributions')
    .delete()
    .eq('exam_config_id', cfg.id)
  if (delErr) throw new Error(`distributions delete: ${delErr.message}`)

  const { error: insErr } = await db.from('exam_config_distributions').insert(
    dist.map((d) => ({
      exam_config_id: cfg.id,
      topic_id: d.topicId,
      subtopic_id: d.subtopicId,
      question_count: d.count,
    })),
  )
  if (insErr) throw new Error(`distributions insert: ${insErr.message}`)

  console.log(
    `  Exam config (MET ${EXAM_SUBJECT_CODE}): enabled, ${EXAM_TOTAL_QUESTIONS} questions`,
  )
  for (const d of dist) {
    console.log(`    ${d.subtopicCode}: ${d.count}`)
  }
  return cfg.id
}

async function seedLingeringPracticeSession(
  orgId: string,
  studentId: string,
  practiceSubjectId: string,
) {
  // Pick a handful of real, active ALW question ids for the frozen config.
  const { data: qs, error: qErr } = await db
    .from('questions')
    .select('id')
    .eq('organization_id', orgId)
    .eq('subject_id', practiceSubjectId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(5)
  if (qErr) throw new Error(`ALW questions: ${qErr.message}`)
  const questionIds = (qs ?? []).map((q) => q.id)
  if (questionIds.length === 0) {
    throw new Error('No active ALW questions found — run the base seed first.')
  }

  // Single-active invariant: soft-delete any pre-existing active session for the
  // student so the new INSERT cannot collide with uq_one_active_session_per_student.
  const { data: cleared, error: clearErr } = await db
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (clearErr) throw new Error(`clear active sessions: ${clearErr.message}`)
  if ((cleared?.length ?? 0) > 0) {
    console.log(`  Cleared ${cleared?.length} pre-existing active session(s)`)
  }

  const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
  const { data: sess, error: sErr } = await db
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'quick_quiz',
      subject_id: practiceSubjectId,
      config: { question_ids: questionIds },
      total_questions: questionIds.length,
      started_at: startedAt,
    })
    .select('id')
    .single()
  if (sErr || !sess) throw new Error(`lingering session: ${sErr?.message}`)

  console.log(
    `  Lingering practice session (ALW ${PRACTICE_SUBJECT_CODE}, quick_quiz): ${sess.id} (${questionIds.length} questions, started 1h ago)`,
  )
  return sess.id
}

async function seed() {
  console.log('Seeding #1011 single-active-session eval data...\n')

  const orgId = await findOrgId()
  const studentId = await findStudentId()
  const examSubjectId = await findSubjectId(EXAM_SUBJECT_CODE)
  const practiceSubjectId = await findSubjectId(PRACTICE_SUBJECT_CODE)
  console.log(`  Org: ${orgId}`)
  console.log(`  Student: ${studentId}`)

  await seedExamConfig(orgId, examSubjectId)
  const lingeringSessionId = await seedLingeringPracticeSession(orgId, studentId, practiceSubjectId)

  console.log(`
=== MANUAL EVAL READY (#1011 single-active-session) ===

Branch:  feat/1011-single-active-session
Server:  cd apps/web && pnpm dev  ->  http://localhost:3000

Student: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}

Seeded for this eval:
  - MET (050): enabled Practice Exam config (${EXAM_TOTAL_QUESTIONS} questions) -> Practice Exam toggle is ON and the exam is STARTABLE.
  - ALW (010): ONE lingering active quick_quiz session (id ${lingeringSessionId}), started 1h ago, ended_at NULL -> backs ActivePracticeBanner.

SCENARIOS:
[ ] 1. Discovery -> Practice-Exam block:
       Open the ActivePracticeBanner for the ALW session is showing on /app/quiz.
       (a) Start a NEW Discovery session on any subject. (b) Without exiting it,
       try to start the MET Practice Exam -> blocked ('another_session_active'),
       OR Discovery is the active session and the exam refuses to start.
       Backed by: MET exam_config + the single-active guard in start_exam_session.
[ ] 2. Practice-Exam -> Practice (cross-subject) block:
       With the lingering ALW quick_quiz session active, try to start the MET
       Practice Exam -> blocked because a DIFFERENT-subject active session exists.
       Backed by: lingering ALW session (subject != MET) + start_exam_session guard.
[ ] 3. ActivePracticeBanner discard:
       On /app/quiz the banner surfaces the lingering ALW session (subject name
       'Air Law'). Click Discard -> session soft-deleted, banner clears, you can
       now start a fresh session/exam.
       Backed by: get_active_practice_session embed resolving the ALW subject.
[ ] 4. Discovery Exit teardown:
       Start a Discovery session, then Exit -> the ephemeral discovery row is
       soft-deleted (no lingering active session left behind).
       Backed by: start_discovery_session + discovery auto-clear in the start RPCs.
[ ] 5. Same-mode restart:
       After discarding the ALW session, start a fresh quick_quiz -> succeeds
       (exactly one active session at a time, no stale block).
[ ] 6. Cross-browser / cleared-storage:
       The lingering ALW session was created server-side with NO localStorage.
       In a clean browser/profile, login -> ActivePracticeBanner still surfaces it
       (server-visible recovery, not localStorage-dependent) and Discard works.
       Backed by: get_active_practice_session (server query, no client state).
`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
