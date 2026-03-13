/**
 * Seed script for manual evaluation.
 * Adds a second subject (Air Law) with questions + completed quiz sessions
 * so reports sorting and multi-subject filtering can be tested.
 *
 * Run AFTER seed-e2e.ts and seed-test-user.ts.
 *
 * Usage: cd apps/web && set -a && source .env.local && set +a && npx tsx scripts/seed-eval.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const val = trimmed.slice(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const AIR_LAW_QUESTIONS = [
  {
    question_number: 'EVAL-ALW-001',
    question_text: 'ICAO is the abbreviation for:',
    options: [
      { id: 'a', text: 'International Civil Aviation Organization', correct: true },
      { id: 'b', text: 'International Commercial Aviation Organization', correct: false },
      { id: 'c', text: 'International Civil Aeronautics Office', correct: false },
      { id: 'd', text: 'International Commission for Air Operations', correct: false },
    ],
    explanation_text: 'ICAO stands for the International Civil Aviation Organization.',
  },
  {
    question_number: 'EVAL-ALW-002',
    question_text: 'The Chicago Convention was signed in:',
    options: [
      { id: 'a', text: '1919', correct: false },
      { id: 'b', text: '1944', correct: true },
      { id: 'c', text: '1958', correct: false },
      { id: 'd', text: '1971', correct: false },
    ],
    explanation_text:
      'The Convention on International Civil Aviation was signed in Chicago in 1944.',
  },
  {
    question_number: 'EVAL-ALW-003',
    question_text: 'A PPL holder may act as PIC of:',
    options: [
      { id: 'a', text: 'Commercial air transport flights', correct: false },
      { id: 'b', text: 'Non-commercial flights only', correct: true },
      { id: 'c', text: 'Any flight within the state of issue', correct: false },
      { id: 'd', text: 'Cargo flights under 5700 kg', correct: false },
    ],
    explanation_text: 'A PPL permits non-commercial flights only.',
  },
  {
    question_number: 'EVAL-ALW-004',
    question_text: 'The minimum age for a PPL(A) holder is:',
    options: [
      { id: 'a', text: '16 years', correct: false },
      { id: 'b', text: '17 years', correct: true },
      { id: 'c', text: '18 years', correct: false },
      { id: 'd', text: '21 years', correct: false },
    ],
    explanation_text: 'The minimum age for a PPL(A) is 17 years.',
  },
  {
    question_number: 'EVAL-ALW-005',
    question_text: 'A flight plan must be filed for flights:',
    options: [
      { id: 'a', text: 'Only in controlled airspace', correct: false },
      { id: 'b', text: 'Crossing international borders', correct: true },
      { id: 'c', text: 'Only at night', correct: false },
      { id: 'd', text: 'Within 5 NM of an aerodrome', correct: false },
    ],
    explanation_text: 'A flight plan is mandatory for international flights.',
  },
  {
    question_number: 'EVAL-ALW-006',
    question_text: 'The semicircular rule determines:',
    options: [
      { id: 'a', text: 'Minimum safe altitude', correct: false },
      { id: 'b', text: 'Cruising level based on track', correct: true },
      { id: 'c', text: 'Separation between aircraft', correct: false },
      { id: 'd', text: 'Speed restrictions', correct: false },
    ],
    explanation_text: 'The semicircular rule assigns cruising levels based on magnetic track.',
  },
  {
    question_number: 'EVAL-ALW-007',
    question_text: 'A Class D airspace requires:',
    options: [
      { id: 'a', text: 'No ATC clearance', correct: false },
      { id: 'b', text: 'ATC clearance before entry', correct: true },
      { id: 'c', text: 'IFR flight only', correct: false },
      { id: 'd', text: 'Transponder Mode S only', correct: false },
    ],
    explanation_text: 'ATC clearance is required before entering Class D airspace.',
  },
  {
    question_number: 'EVAL-ALW-008',
    question_text: 'A NOTAM is a:',
    options: [
      { id: 'a', text: 'Notice to Air Missions', correct: true },
      { id: 'b', text: 'Notice to Aircraft Mechanics', correct: false },
      { id: 'c', text: 'Navigation Order for Tactical Airspace Management', correct: false },
      { id: 'd', text: 'Notification of Airport Maintenance', correct: false },
    ],
    explanation_text: 'NOTAM stands for Notice to Air Missions (formerly Notice to Airmen).',
  },
  {
    question_number: 'EVAL-ALW-009',
    question_text: 'Right of way — which aircraft has priority?',
    options: [
      { id: 'a', text: 'The faster aircraft', correct: false },
      { id: 'b', text: 'The aircraft on the right', correct: true },
      { id: 'c', text: 'The heavier aircraft', correct: false },
      { id: 'd', text: 'The aircraft at higher altitude', correct: false },
    ],
    explanation_text: 'When converging, the aircraft on the right has right of way.',
  },
  {
    question_number: 'EVAL-ALW-010',
    question_text: 'The transponder code for hijack is:',
    options: [
      { id: 'a', text: '7500', correct: true },
      { id: 'b', text: '7600', correct: false },
      { id: 'c', text: '7700', correct: false },
      { id: 'd', text: '7000', correct: false },
    ],
    explanation_text: '7500 = hijack, 7600 = radio failure, 7700 = emergency.',
  },
  {
    question_number: 'EVAL-ALW-011',
    question_text: 'VFR flight requires a minimum visibility of:',
    options: [
      { id: 'a', text: '1500 m', correct: false },
      { id: 'b', text: '5 km', correct: true },
      { id: 'c', text: '8 km', correct: false },
      { id: 'd', text: '10 km', correct: false },
    ],
    explanation_text: 'VFR flights generally require 5 km visibility (varies by airspace class).',
  },
  {
    question_number: 'EVAL-ALW-012',
    question_text: 'EASA stands for:',
    options: [
      { id: 'a', text: 'European Aviation Safety Agency', correct: true },
      { id: 'b', text: 'European Aeronautical Standards Authority', correct: false },
      { id: 'c', text: 'European Air Services Agency', correct: false },
      { id: 'd', text: 'European Aircraft Safety Authority', correct: false },
    ],
    explanation_text:
      'EASA is the European Aviation Safety Agency (now EU Aviation Safety Agency).',
  },
  {
    question_number: 'EVAL-ALW-013',
    question_text: 'An aircraft must carry sufficient fuel to reach the destination plus:',
    options: [
      { id: 'a', text: '15 minutes reserve', correct: false },
      { id: 'b', text: '30 minutes reserve (day VFR)', correct: false },
      { id: 'c', text: '45 minutes reserve (day VFR)', correct: true },
      { id: 'd', text: '60 minutes reserve', correct: false },
    ],
    explanation_text: 'Day VFR flights require fuel to destination plus 45 minutes reserve.',
  },
  {
    question_number: 'EVAL-ALW-014',
    question_text: 'An ATC instruction "Cleared to land" means:',
    options: [
      { id: 'a', text: 'You may land at your discretion', correct: true },
      { id: 'b', text: 'The runway is guaranteed clear', correct: false },
      { id: 'c', text: 'You must land immediately', correct: false },
      { id: 'd', text: 'No other aircraft are in the pattern', correct: false },
    ],
    explanation_text:
      '"Cleared to land" authorises landing but the pilot remains responsible for separation from visible traffic.',
  },
  {
    question_number: 'EVAL-ALW-015',
    question_text: 'Light signals from ATC — steady green means:',
    options: [
      { id: 'a', text: 'Stop', correct: false },
      { id: 'b', text: 'Cleared to land (in flight)', correct: true },
      { id: 'c', text: 'Return for landing', correct: false },
      { id: 'd', text: 'Give way and continue circling', correct: false },
    ],
    explanation_text:
      'Steady green = cleared to land (in flight) or cleared for takeoff (on ground).',
  },
]

async function seed() {
  console.log('Seeding eval data (second subject + quiz history)...\n')

  // 1. Get existing org
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgErr || !org) throw new Error('Org not found — run seed-e2e.ts first')

  // 2. Get test student
  const { data: student, error: studentErr } = await db
    .from('users')
    .select('id')
    .eq('email', 'pilot.oleksandr@proton.me')
    .single()
  if (studentErr || !student)
    throw new Error('Test student not found — run seed-test-user.ts first')

  // 3. Get admin user (for created_by)
  const { data: admin } = await db
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .eq('organization_id', org.id)
    .limit(1)
    .single()
  const creatorId = admin?.id ?? student.id

  // 4. Get existing bank
  const { data: bank, error: bankErr } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (bankErr || !bank) throw new Error('Question bank not found — run seed-e2e.ts first')

  // 5. Create Air Law subject + topic + subtopic
  const { data: alwSubject, error: alwErr } = await db
    .from('easa_subjects')
    .upsert({ code: '010', name: 'Air Law', short: 'ALW', sort_order: 10 }, { onConflict: 'code' })
    .select('id')
    .single()
  if (alwErr) throw new Error(`Air Law subject: ${alwErr.message}`)
  console.log(`  Air Law subject: ${alwSubject.id}`)

  const { data: alwTopicRow } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', alwSubject.id)
    .eq('code', '010-01')
    .maybeSingle()

  let alwTopicId: string
  if (alwTopicRow) {
    alwTopicId = alwTopicRow.id
  } else {
    const { data: newTopic, error: topicErr } = await db
      .from('easa_topics')
      .insert({
        subject_id: alwSubject.id,
        code: '010-01',
        name: 'International law',
        sort_order: 1,
      })
      .select('id')
      .single()
    if (topicErr) throw new Error(`ALW topic: ${topicErr.message}`)
    alwTopicId = newTopic.id
  }

  const { data: alwSubtopicRow } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', alwTopicId)
    .eq('code', '010-01-01')
    .maybeSingle()

  let alwSubtopicId: string
  if (alwSubtopicRow) {
    alwSubtopicId = alwSubtopicRow.id
  } else {
    const { data: newSub, error: subErr } = await db
      .from('easa_subtopics')
      .insert({
        topic_id: alwTopicId,
        code: '010-01-01',
        name: 'The Chicago Convention',
        sort_order: 1,
      })
      .select('id')
      .single()
    if (subErr) throw new Error(`ALW subtopic: ${subErr.message}`)
    alwSubtopicId = newSub.id
  }
  console.log(`  ALW topic: ${alwTopicId}, subtopic: ${alwSubtopicId}`)

  // 6. Insert Air Law questions
  let inserted = 0
  for (const q of AIR_LAW_QUESTIONS) {
    const { data: existing } = await db
      .from('questions')
      .select('id')
      .eq('bank_id', bank.id)
      .eq('question_number', q.question_number)
      .is('deleted_at', null)
      .limit(1)

    if (existing && existing.length > 0) continue

    const { error: qErr } = await db.from('questions').insert({
      organization_id: org.id,
      bank_id: bank.id,
      question_number: q.question_number,
      subject_id: alwSubject.id,
      topic_id: alwTopicId,
      subtopic_id: alwSubtopicId,
      question_text: q.question_text,
      options: q.options,
      explanation_text: q.explanation_text,
      difficulty: 'medium',
      status: 'active',
      created_by: creatorId,
    })
    if (qErr) throw new Error(`Question ${q.question_number}: ${qErr.message}`)
    inserted++
  }
  console.log(
    `  Air Law questions: ${inserted} inserted, ${AIR_LAW_QUESTIONS.length - inserted} skipped`,
  )

  // 7. Create completed quiz sessions for reports testing
  // Get Meteorology subject + questions
  const { data: metSubject } = await db
    .from('easa_subjects')
    .select('id')
    .eq('code', '050')
    .single()

  if (!metSubject) throw new Error('Meteorology subject not found')

  const { data: metQuestions } = await db
    .from('questions')
    .select('id, options')
    .eq('subject_id', metSubject.id)
    .is('deleted_at', null)
    .limit(10)

  const { data: alwQuestions } = await db
    .from('questions')
    .select('id, options')
    .eq('subject_id', alwSubject.id)
    .is('deleted_at', null)
    .limit(10)

  if (!metQuestions?.length || !alwQuestions?.length) {
    throw new Error('No questions found for creating quiz sessions')
  }

  // Helper to create a completed quiz session
  async function createCompletedSession(
    subjectId: string,
    questions: { id: string; options: unknown }[],
    correctRate: number,
    daysAgo: number,
  ) {
    const questionCount = questions.length
    const correctCount = Math.round(questionCount * correctRate)
    const scorePct = Math.round((correctCount / questionCount) * 100)
    const endedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()

    // Create session
    const { data: session, error: sessErr } = await db
      .from('quiz_sessions')
      .insert({
        organization_id: org.id,
        student_id: student.id,
        subject_id: subjectId,
        mode: 'quick_quiz',
        total_questions: questionCount,
        correct_count: correctCount,
        score_percentage: scorePct,
        ended_at: endedAt,
      })
      .select('id')
      .single()
    if (sessErr) throw new Error(`Session: ${sessErr.message}`)

    // Create session answers
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q) continue
      const opts = q.options as { id: string; correct: boolean }[]
      const isCorrect = i < correctCount
      const correctOpt = opts.find((o) => o.correct)
      const incorrectOpt = opts.find((o) => !o.correct)
      const selectedOption = isCorrect ? correctOpt : incorrectOpt
      if (!selectedOption) continue

      await db.from('quiz_session_answers').insert({
        session_id: session.id,
        question_id: q.id,
        selected_option_id: selectedOption.id,
        is_correct: isCorrect,
        response_time_ms: Math.floor(Math.random() * 30000) + 5000,
      })
    }

    return { sessionId: session.id, score: scorePct, questionCount }
  }

  console.log('\n  Creating completed quiz sessions for reports...')

  // MET quiz: 8/10 correct, 5 days ago
  const met1 = await createCompletedSession(metSubject.id, metQuestions.slice(0, 10), 0.8, 5)
  console.log(`    MET quiz 1: score ${met1.score}%, ${met1.questionCount} questions, 5 days ago`)

  // MET quiz: 6/10 correct, 2 days ago
  const met2 = await createCompletedSession(metSubject.id, metQuestions.slice(0, 10), 0.6, 2)
  console.log(`    MET quiz 2: score ${met2.score}%, ${met2.questionCount} questions, 2 days ago`)

  // ALW quiz: 10/10 correct, 3 days ago
  const alw1 = await createCompletedSession(alwSubject.id, alwQuestions.slice(0, 10), 1.0, 3)
  console.log(`    ALW quiz 1: score ${alw1.score}%, ${alw1.questionCount} questions, 3 days ago`)

  // ALW quiz: 4/5 correct (partial), 1 day ago
  const alw2 = await createCompletedSession(alwSubject.id, alwQuestions.slice(0, 5), 0.8, 1)
  console.log(`    ALW quiz 2: score ${alw2.score}%, ${alw2.questionCount} questions, 1 day ago`)

  // MET quiz: 3/5 correct (partial), today
  const met3 = await createCompletedSession(metSubject.id, metQuestions.slice(0, 5), 0.6, 0)
  console.log(`    MET quiz 3: score ${met3.score}%, ${met3.questionCount} questions, today`)

  console.log('\nEval seed complete!')
  console.log('  2 subjects: Meteorology (20 Qs) + Air Law (15 Qs)')
  console.log('  5 completed quiz sessions with different scores/dates/subjects')
  console.log('  Ready for manual testing.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
