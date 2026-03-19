/**
 * Seed script for Quiz Setup Redesign manual evaluation (PR #272).
 *
 * Creates:
 * - Admin + Student users
 * - 3 EASA subjects with topics/subtopics and ~40 questions total
 * - Student response history (for "unseen" / "incorrect" filters)
 * - Flagged questions (for "flagged" filter)
 * - A saved quiz draft (for "Saved Quizzes" tab)
 *
 * Run AFTER `npx supabase db reset`.
 * Usage: cd apps/web && npx tsx scripts/seed-quiz-setup-eval.ts
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

const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id

  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

// --- Syllabus data ---

type SubjectSeed = {
  code: string
  name: string
  short: string
  sortOrder: number
  topics: TopicSeed[]
}

type TopicSeed = {
  code: string
  name: string
  subtopics: { code: string; name: string; questionCount: number }[]
}

const SUBJECTS: SubjectSeed[] = [
  {
    code: '050',
    name: 'Meteorology',
    short: 'MET',
    sortOrder: 5,
    topics: [
      {
        code: '050-01',
        name: 'The Atmosphere',
        subtopics: [
          { code: '050-01-01', name: 'Composition, extent, vertical division', questionCount: 4 },
          { code: '050-01-02', name: 'Temperature', questionCount: 3 },
        ],
      },
      {
        code: '050-02',
        name: 'Wind',
        subtopics: [
          { code: '050-02-01', name: 'Definition and measurement of wind', questionCount: 3 },
          { code: '050-02-02', name: 'Primary cause of wind', questionCount: 2 },
        ],
      },
      {
        code: '050-03',
        name: 'Clouds and Precipitation',
        subtopics: [{ code: '050-03-01', name: 'Cloud formation and types', questionCount: 3 }],
      },
    ],
  },
  {
    code: '010',
    name: 'Air Law',
    short: 'ALW',
    sortOrder: 1,
    topics: [
      {
        code: '010-01',
        name: 'International Law',
        subtopics: [
          {
            code: '010-01-01',
            name: 'The Convention on International Civil Aviation',
            questionCount: 3,
          },
          { code: '010-01-02', name: 'ICAO Annexes', questionCount: 2 },
        ],
      },
      {
        code: '010-02',
        name: 'Airworthiness of Aircraft',
        subtopics: [{ code: '010-02-01', name: 'Certificate of Airworthiness', questionCount: 3 }],
      },
    ],
  },
  {
    code: '030',
    name: 'Flight Performance & Planning',
    short: 'FPP',
    sortOrder: 3,
    topics: [
      {
        code: '030-01',
        name: 'Mass and Balance',
        subtopics: [
          { code: '030-01-01', name: 'Loading limitations', questionCount: 4 },
          { code: '030-01-02', name: 'Centre of gravity', questionCount: 3 },
        ],
      },
      {
        code: '030-02',
        name: 'Performance',
        subtopics: [
          { code: '030-02-01', name: 'Take-off and landing performance', questionCount: 4 },
          { code: '030-02-02', name: 'Climb and cruise performance', questionCount: 3 },
        ],
      },
    ],
  },
]

const QUESTION_STEMS = [
  'Which of the following best describes',
  'What is the primary factor affecting',
  'In accordance with regulations, which statement is correct regarding',
  'The purpose of',
  'Which condition is most likely to result in',
  'What happens when',
  'The correct procedure for',
  'Which of the following is true about',
]

function makeQuestion(num: number, subtopicName: string) {
  const stem = QUESTION_STEMS[num % QUESTION_STEMS.length]
  return {
    question_number: `EVAL-${String(num).padStart(3, '0')}`,
    question_text: `${stem} ${subtopicName.toLowerCase()}?`,
    options: [
      { id: 'a', text: `Option A for Q${num}`, correct: false },
      { id: 'b', text: `Option B for Q${num} (correct)`, correct: true },
      { id: 'c', text: `Option C for Q${num}`, correct: false },
      { id: 'd', text: `Option D for Q${num}`, correct: false },
    ],
    explanation_text: `Explanation for question ${num} about ${subtopicName}.`,
    difficulty: num % 3 === 0 ? 'hard' : num % 3 === 1 ? 'easy' : 'medium',
  }
}

async function seed() {
  console.log('Seeding Quiz Setup Redesign eval data...\n')

  // 1. Organization
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr) throw new Error(`Org: ${orgErr.message}`)
  console.log(`  Org: ${org.id}`)

  // 2. Users
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  const { error: adminErr } = await db.from('users').upsert(
    {
      id: adminId,
      organization_id: org.id,
      email: ADMIN_EMAIL,
      full_name: 'Admin User',
      role: 'admin',
    },
    { onConflict: 'id' },
  )
  if (adminErr) throw new Error(`Admin: ${adminErr.message}`)
  console.log(`  Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)

  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  const { error: studentErr } = await db.from('users').upsert(
    {
      id: studentId,
      organization_id: org.id,
      email: STUDENT_EMAIL,
      full_name: 'Student User',
      role: 'student',
    },
    { onConflict: 'id' },
  )
  if (studentErr) throw new Error(`Student: ${studentErr.message}`)
  console.log(`  Student: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)

  // 3. Question bank (find existing or insert)
  const { data: existingBank } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .eq('name', 'EASA PPL(A) QDB')
    .is('deleted_at', null)
    .maybeSingle()

  let bankId: string
  if (existingBank) {
    bankId = existingBank.id
  } else {
    const { data: newBank, error: bankErr } = await db
      .from('question_banks')
      .insert({ organization_id: org.id, name: 'EASA PPL(A) QDB', created_by: adminId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`Bank: ${bankErr.message}`)
    bankId = newBank.id
  }
  console.log(`  Bank: ${bankId}`)

  // 4. Subjects, topics, subtopics, questions
  let questionNum = 1
  const allQuestionIds: string[] = []
  // Track which questions belong to which subject (for drafts)
  const subjectQuestionIds: Record<string, string[]> = {}
  let firstSubjectId = ''
  let firstSubjectName = ''

  for (const subj of SUBJECTS) {
    const { data: subject, error: subjErr } = await db
      .from('easa_subjects')
      .upsert(
        { code: subj.code, name: subj.name, short: subj.short, sort_order: subj.sortOrder },
        { onConflict: 'code' },
      )
      .select('id')
      .single()
    if (subjErr) throw new Error(`Subject ${subj.code}: ${subjErr.message}`)

    if (!firstSubjectId) {
      firstSubjectId = subject.id
      firstSubjectName = subj.name
    }

    subjectQuestionIds[subject.id] = []
    let subjectQCount = 0

    for (const top of subj.topics) {
      const { data: existingTopic } = await db
        .from('easa_topics')
        .select('id')
        .eq('subject_id', subject.id)
        .eq('code', top.code)
        .maybeSingle()

      let topicId: string
      if (existingTopic) {
        topicId = existingTopic.id
      } else {
        const { data: newTopic, error: topErr } = await db
          .from('easa_topics')
          .insert({
            subject_id: subject.id,
            code: top.code,
            name: top.name,
            sort_order: subj.topics.indexOf(top) + 1,
          })
          .select('id')
          .single()
        if (topErr) throw new Error(`Topic ${top.code}: ${topErr.message}`)
        topicId = newTopic.id
      }

      for (const sub of top.subtopics) {
        const { data: existingSub } = await db
          .from('easa_subtopics')
          .select('id')
          .eq('topic_id', topicId)
          .eq('code', sub.code)
          .maybeSingle()

        let subtopicId: string
        if (existingSub) {
          subtopicId = existingSub.id
        } else {
          const { data: newSub, error: subErr } = await db
            .from('easa_subtopics')
            .insert({
              topic_id: topicId,
              code: sub.code,
              name: sub.name,
              sort_order: top.subtopics.indexOf(sub) + 1,
            })
            .select('id')
            .single()
          if (subErr) throw new Error(`Subtopic ${sub.code}: ${subErr.message}`)
          subtopicId = newSub.id
        }

        // Insert questions for this subtopic
        for (let i = 0; i < sub.questionCount; i++) {
          const q = makeQuestion(questionNum, sub.name)
          const { data: qRow, error: qErr } = await db
            .from('questions')
            .insert({
              organization_id: org.id,
              bank_id: bankId,
              question_number: q.question_number,
              subject_id: subject.id,
              topic_id: topicId,
              subtopic_id: subtopicId,
              question_text: q.question_text,
              options: q.options,
              explanation_text: q.explanation_text,
              difficulty: q.difficulty,
              status: 'active',
              created_by: adminId,
            })
            .select('id')
            .single()
          if (qErr) throw new Error(`Q ${q.question_number}: ${qErr.message}`)
          allQuestionIds.push(qRow.id)
          subjectQuestionIds[subject.id].push(qRow.id)
          questionNum++
          subjectQCount++
        }
      }
    }
    console.log(
      `  ${subj.short} (${subj.code}): ${subj.topics.length} topics, ${subjectQCount} questions`,
    )
  }

  console.log(`  Total questions: ${allQuestionIds.length}`)

  // 5. Student response history — answer first 10 questions (makes them "seen")
  //    Make some correct, some incorrect (for filter testing)
  const answeredIds = allQuestionIds.slice(0, 10)
  for (let i = 0; i < answeredIds.length; i++) {
    const isCorrect = i % 3 !== 0 // every 3rd answer is wrong
    const { error: respErr } = await db.from('student_responses').insert({
      organization_id: org.id,
      student_id: studentId,
      question_id: answeredIds[i],
      selected_option_id: isCorrect ? 'b' : 'a',
      is_correct: isCorrect,
      response_time_ms: 3000 + Math.floor(Math.random() * 5000),
    })
    if (respErr) throw new Error(`Response ${i}: ${respErr.message}`)
  }
  console.log(
    `  Student responses: ${answeredIds.length} (${answeredIds.filter((_, i) => i % 3 === 0).length} incorrect)`,
  )

  // 6. FSRS cards — track last_was_correct for the "incorrect" filter
  for (let i = 0; i < answeredIds.length; i++) {
    const isCorrect = i % 3 !== 0
    const { error: fsrsErr } = await db.from('fsrs_cards').upsert(
      {
        student_id: studentId,
        question_id: answeredIds[i],
        last_was_correct: isCorrect,
        state: isCorrect ? 'review' : 'learning',
        reps: 1,
      },
      { onConflict: 'student_id,question_id' },
    )
    if (fsrsErr) throw new Error(`FSRS card ${i}: ${fsrsErr.message}`)
  }
  console.log(`  FSRS cards: ${answeredIds.length}`)

  // 7. Flagged questions — flag 5 questions (mix of answered and unanswered)
  const flaggedIds = [
    ...answeredIds.slice(0, 2), // 2 that were answered
    ...allQuestionIds.slice(15, 18), // 3 that were NOT answered
  ]
  for (const qId of flaggedIds) {
    const { error: flagErr } = await db
      .from('flagged_questions')
      .upsert({ student_id: studentId, question_id: qId }, { onConflict: 'student_id,question_id' })
    if (flagErr) throw new Error(`Flag: ${flagErr.message}`)
  }
  console.log(`  Flagged questions: ${flaggedIds.length}`)

  // 8. Saved quiz draft — partially completed quiz on first subject
  const draftQuestionIds = subjectQuestionIds[firstSubjectId].slice(0, 5)
  const { error: draftErr } = await db.from('quiz_drafts').insert({
    student_id: studentId,
    organization_id: org.id,
    session_config: {
      sessionId: '',
      subjectName: firstSubjectName,
      subjectCode: SUBJECTS[0].code,
      mode: 'study',
    },
    question_ids: draftQuestionIds,
    answers: { [draftQuestionIds[0]]: 'b', [draftQuestionIds[1]]: 'a' },
    current_index: 2,
  })
  if (draftErr) throw new Error(`Draft: ${draftErr.message}`)
  console.log(`  Saved draft: 5 questions, 2 answered (${firstSubjectName})`)

  // Done
  console.log(`
=== MANUAL EVAL READY ===

Branch:  feat/176-quiz-setup-redesign
Server:  http://localhost:3000

Admin:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
Student: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}

CHECKLIST:
[ ] 1. Login as student → navigate to /app/quiz
[ ] 2. "New Quiz" tab is active by default
[ ] 3. Subject dropdown shows 3 subjects with question counts
[ ] 4. Select "Meteorology" → topic tree loads with 3 topics, 5 subtopics
[ ] 5. Topic tree: expand/collapse chevrons work for topics with subtopics
[ ] 6. Topic tree: "Select all" checkbox toggles all topics/subtopics
[ ] 7. Topic tree: uncheck a subtopic → parent auto-unchecks
[ ] 8. Topic tree: check all subtopics of a topic → parent auto-checks
[ ] 9. Question count slider adjusts (1 to max), preset buttons 10/25/50/All work
[ ] 10. Uncheck topics → slider max decreases, presets disable when > max
[ ] 11. Mode toggle: "Study" selected, "Exam" disabled with "Coming soon"
[ ] 12. Filter pills: "All questions" active by default
[ ] 13. Toggle "Unseen only" → count updates (should be fewer than total)
[ ] 14. Toggle "Incorrectly answered" → count updates (should show ~4)
[ ] 15. Toggle "Flagged" → count updates (should show 5)
[ ] 16. Multi-filter: select "Unseen" + "Flagged" → union count shown
[ ] 17. Select "All questions" → clears other filters
[ ] 18. Start quiz with filters → quiz session starts correctly
[ ] 19. Switch to "Saved Quizzes" tab → shows 1 draft with progress bar (2/5)
[ ] 20. Resume draft → navigates to /app/quiz/session with correct state
[ ] 21. Delete draft → draft disappears from list
[ ] 22. Switch subject → topic tree reloads, filters reset, count resets
[ ] 23. Edge: uncheck ALL topics → "Start Quiz" should be disabled or show 0
[ ] 24. Edge: start quiz with 0 matching questions → error message shown
[ ] 25. Login as admin → /app/quiz should work the same (admin can also quiz)
`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
