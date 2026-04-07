/**
 * Seed script for Admin Dashboard manual evaluation.
 * Creates 5 additional students with varied quiz activity so the dashboard
 * shows meaningful KPIs, student table rows, weak topics, and recent activity.
 *
 * Run AFTER seed-admin-eval.ts + seed-more-questions.ts.
 * Usage: cd apps/web && npx tsx scripts/seed-dashboard-eval.ts
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
  console.error(`Refusing to seed against non-local URL: ${SUPABASE_URL}`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FIRST_NAMES = [
  'Alice',
  'Bob',
  'Carol',
  'Dave',
  'Eve',
  'Frank',
  'Grace',
  'Hank',
  'Iris',
  'Jack',
  'Karen',
  'Leo',
  'Mona',
  'Nick',
  'Olivia',
  'Paul',
  'Quinn',
  'Rosa',
  'Sam',
  'Tina',
  'Uma',
  'Vic',
  'Wendy',
  'Xander',
  'Yara',
  'Zane',
  'Amy',
  'Ben',
  'Cleo',
  'Dan',
]
const LAST_NAMES = [
  'Johnson',
  'Smith',
  'Williams',
  'Brown',
  'Davis',
  'Miller',
  'Wilson',
  'Moore',
  'Taylor',
  'Anderson',
  'Thomas',
  'Jackson',
  'White',
  'Harris',
  'Martin',
  'Garcia',
  'Clark',
  'Lewis',
  'Lee',
  'Walker',
  'Hall',
  'Allen',
  'Young',
  'King',
  'Wright',
  'Scott',
  'Green',
  'Baker',
  'Adams',
  'Nelson',
]

const STUDENTS = FIRST_NAMES.map((first, i) => ({
  email: `${first.toLowerCase()}@lmsplus.local`,
  name: `${first} ${LAST_NAMES[i]}`,
  daysActive: Math.max(1, Math.floor(Math.random() * 60)),
}))

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (data?.user) return data.user.id
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth ${email}: ${error.message}`)
  }
  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

async function seed() {
  console.log('Seeding Admin Dashboard eval data...\n')

  // 1. Get org
  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (!org) throw new Error('Org not found — run seed-admin-eval.ts first')

  // 2. Get all active questions with their topics
  const { data: questions } = await db
    .from('questions')
    .select('id, options, subject_id, topic_id')
    .eq('organization_id', org.id)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (!questions?.length) throw new Error('No questions found — run seed-more-questions.ts first')
  console.log(`  Found ${questions.length} questions across subjects`)

  // 3. Get subjects for session creation
  const subjectIds = [...new Set(questions.map((q) => q.subject_id))]
  const { data: subjects } = await db.from('easa_subjects').select('id, code').in('id', subjectIds)
  if (!subjects?.length) throw new Error('No subjects found')

  // 4. Get existing admin and student for bank reference
  const { data: admin } = await db
    .from('users')
    .select('id')
    .eq('email', 'admin@lmsplus.local')
    .single()
  if (!admin) throw new Error('Admin not found')
  const { data: bankRow } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (!bankRow) throw new Error('Question bank not found')

  // 5. Create students
  const studentIds: string[] = []
  for (const s of STUDENTS) {
    const id = await ensureAuthUser(s.email, 'test123!')
    const lastActiveAt = new Date(Date.now() - s.daysActive * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await db.from('users').upsert(
      {
        id,
        organization_id: org.id,
        email: s.email,
        full_name: s.name,
        role: 'student',
        last_active_at: lastActiveAt,
      },
      { onConflict: 'id' },
    )
    if (error) throw new Error(`User ${s.email}: ${error.message}`)
    studentIds.push(id)
    console.log(`  Student: ${s.name} (active ${s.daysActive}d ago)`)
  }

  // Also update the existing student's last_active_at
  await db
    .from('users')
    .update({ last_active_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('email', 'student@lmsplus.local')

  // 6. Create quiz sessions and responses for each student
  // Give every student 1-3 sessions, plus Alice gets 30 for session history pagination
  type SessionCfg = { subjectIdx: number; correctRate: number; daysAgo: number; qCount: number }
  type StudentSessions = { studentIdx: number; sessions: SessionCfg[] }

  const sessionConfigs: StudentSessions[] = []

  // Alice (idx 0): 30 sessions so session history paginates (PAGE_SIZE=25)
  const aliceSessions: SessionCfg[] = []
  for (let i = 0; i < 30; i++) {
    aliceSessions.push({
      subjectIdx: i % subjects.length,
      correctRate: 0.5 + Math.random() * 0.5,
      daysAgo: i + 1,
      qCount: 4 + (i % 5),
    })
  }
  sessionConfigs.push({ studentIdx: 0, sessions: aliceSessions })

  // Every other student gets 2-4 sessions with varied performance
  for (let i = 1; i < studentIds.length; i++) {
    const count = 2 + (i % 3)
    const sessions: SessionCfg[] = []
    for (let j = 0; j < count; j++) {
      sessions.push({
        subjectIdx: (i + j) % subjects.length,
        correctRate: 0.2 + Math.random() * 0.7,
        daysAgo: 1 + Math.floor(Math.random() * 50),
        qCount: 4 + (j % 4),
      })
    }
    sessionConfigs.push({ studentIdx: i, sessions })
  }

  // Original student: a couple sessions
  sessionConfigs.push({
    studentIdx: -1,
    sessions: [
      { subjectIdx: 0, correctRate: 0.8, daysAgo: 2, qCount: 8 },
      { subjectIdx: 1, correctRate: 0.65, daysAgo: 4, qCount: 6 },
    ],
  })

  let totalSessions = 0
  let totalResponses = 0

  for (const cfg of sessionConfigs) {
    let sid: string
    if (cfg.studentIdx === -1) {
      const { data: existingStudent } = await db
        .from('users')
        .select('id')
        .eq('email', 'student@lmsplus.local')
        .single()
      if (!existingStudent) continue
      sid = existingStudent.id
    } else {
      const studentId = studentIds[cfg.studentIdx]
      if (!studentId) continue
      sid = studentId
    }

    for (const sess of cfg.sessions) {
      const subject = subjects[sess.subjectIdx % subjects.length]
      if (!subject) continue
      const subjectQuestions = questions.filter((q) => q.subject_id === subject.id)
      const qSlice = subjectQuestions.slice(0, Math.min(subjectQuestions.length, sess.qCount))
      if (qSlice.length === 0) continue

      const correctCount = Math.round(qSlice.length * sess.correctRate)
      const scorePct = Math.round((correctCount / qSlice.length) * 100)
      const endedAt = new Date(Date.now() - sess.daysAgo * 24 * 60 * 60 * 1000).toISOString()

      const { data: session, error: sessErr } = await db
        .from('quiz_sessions')
        .insert({
          organization_id: org.id,
          student_id: sid,
          subject_id: subject.id,
          mode: sess.daysAgo < 5 ? 'quick_quiz' : 'mock_exam',
          total_questions: qSlice.length,
          correct_count: correctCount,
          score_percentage: scorePct,
          ended_at: endedAt,
        })
        .select('id')
        .single()
      if (sessErr) throw new Error(`Session: ${sessErr.message}`)
      totalSessions++

      // Insert quiz_session_answers + student_responses
      for (let j = 0; j < qSlice.length; j++) {
        const q = qSlice[j]
        if (!q) continue
        const opts = q.options as { id: string; correct: boolean }[]
        const isCorrect = j < correctCount
        const selected = isCorrect ? opts.find((o) => o.correct) : opts.find((o) => !o.correct)
        if (!selected) continue

        await db.from('quiz_session_answers').insert({
          session_id: session?.id ?? '',
          question_id: q.id,
          selected_option_id: selected.id,
          is_correct: isCorrect,
          response_time_ms: Math.floor(Math.random() * 25000) + 5000,
        })

        await db.from('student_responses').insert({
          organization_id: org.id,
          student_id: sid,
          question_id: q.id,
          session_id: session?.id ?? null,
          selected_option_id: selected.id,
          is_correct: isCorrect,
          response_time_ms: Math.floor(Math.random() * 25000) + 5000,
        })
        totalResponses++
      }
    }
  }

  console.log(`\n  Created ${totalSessions} quiz sessions, ${totalResponses} responses`)

  console.log('\n--- DASHBOARD EVAL READY ---')
  console.log('\nAdmin login:  admin@lmsplus.local / admin123!')
  console.log('Dashboard:    http://localhost:3000/app/admin/dashboard')
  console.log('\nExpected:')
  console.log(`  - ${studentIds.length + 1} students total (1 original + ${studentIds.length} new)`)
  console.log('  - Student table: 2 pages (PAGE_SIZE=25)')
  console.log('  - Alice session history: 2 pages (30 sessions)')
  console.log('  - KPIs: active students, sessions, avg mastery, weakest subject')
  console.log('  - Weak topics: topics with low correct rates')
  console.log('  - Recent activity: sessions from last 7 days')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
