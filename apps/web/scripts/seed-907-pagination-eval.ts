/**
 * Seed script for PR #1042 (#907) — admin Internal Exams Codes & Attempts PAGINATION eval.
 *
 * Builds on the internal-exam eval data and bulk-seeds enough rows to exceed one page
 * (PAGE_SIZE = 25) on BOTH admin tables:
 *   - 30 ACTIVE internal-exam codes  → Codes tab paginates (2 pages: 25 + 5)
 *   -  4 VOIDED codes                → a sparse status filter to test "filter resets page"
 *   - 30 FINISHED internal_exam attempts (quiz_sessions, ended_at set) → Attempts tab paginates
 *
 * Self-contained + idempotent (safe to re-run): ensures org/admin/student/subject, then
 * deletes its own prior PG907 codes and the student's internal_exam sessions before re-seeding.
 *
 * Run AFTER `npx supabase db reset`. Usage:
 *   cd apps/web && npx tsx scripts/seed-907-pagination-eval.ts
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
  console.error(`Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

const ACTIVE_CODE_COUNT = 30 // > PAGE_SIZE (25) → 2 pages
const VOIDED_CODE_COUNT = 4
const ATTEMPT_COUNT = 30 // > PAGE_SIZE (25) → 2 pages
const ISSUED_BASE = new Date('2026-06-01T00:00:00.000Z').getTime()

async function createAuthUser(email: string, password: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id
  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

async function ensureUser(id: string, orgId: string, email: string, role: 'admin' | 'student') {
  const { error } = await db.from('users').upsert(
    {
      id,
      organization_id: orgId,
      email,
      full_name: role === 'admin' ? 'Admin User' : 'Student User',
      role,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`User row ${email}: ${error.message}`)
}

async function seed() {
  console.log('Seeding #907 pagination eval data...\n')

  // 1. Org
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr) throw new Error(`Org: ${orgErr.message}`)

  // 2. Admin + student
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUser(adminId, org.id, ADMIN_EMAIL, 'admin')
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUser(studentId, org.id, STUDENT_EMAIL, 'student')

  // 3. Subject (MET) — codes/attempts FK-reference subject_id
  const { data: met, error: metErr } = await db
    .from('easa_subjects')
    .upsert(
      { code: '050', name: 'Meteorology', short: 'MET', sort_order: 5 },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (metErr) throw new Error(`Subject: ${metErr.message}`)
  console.log(`  Org ${org.id} / admin ${adminId} / student ${studentId} / subject ${met.id}`)

  // 4. Clean prior PG907 codes + the student's internal_exam sessions (idempotent re-run).
  //    Codes first: an attempt session could otherwise be FK-referenced by a consumed code.
  {
    const { error } = await db
      .from('internal_exam_codes')
      .delete()
      .eq('organization_id', org.id)
      .like('code', 'PG907-%')
      .select('id')
    if (error) throw new Error(`Cleanup codes: ${error.message}`)
  }
  {
    const { error } = await db
      .from('quiz_sessions')
      .delete()
      .eq('student_id', studentId)
      .eq('mode', 'internal_exam')
      .select('id')
    if (error) throw new Error(`Cleanup sessions: ${error.message}`)
  }

  // 5. Bulk codes: 30 active + 4 voided.
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const codes: Record<string, unknown>[] = []
  for (let i = 0; i < ACTIVE_CODE_COUNT; i++) {
    codes.push({
      code: `PG907-A${String(i).padStart(3, '0')}`,
      subject_id: met.id,
      student_id: studentId,
      issued_by: adminId,
      issued_at: new Date(ISSUED_BASE + i * 60_000).toISOString(),
      expires_at: future,
      organization_id: org.id,
    })
  }
  for (let i = 0; i < VOIDED_CODE_COUNT; i++) {
    codes.push({
      code: `PG907-V${String(i).padStart(3, '0')}`,
      subject_id: met.id,
      student_id: studentId,
      issued_by: adminId,
      issued_at: new Date(ISSUED_BASE - (i + 1) * 60_000).toISOString(),
      expires_at: future,
      voided_at: new Date(ISSUED_BASE + 3_600_000).toISOString(),
      voided_by: adminId,
      void_reason: 'Eval: voided to exercise the status filter',
      organization_id: org.id,
    })
  }
  const { error: codesErr } = await db.from('internal_exam_codes').insert(codes)
  if (codesErr) throw new Error(`Insert codes: ${codesErr.message}`)
  console.log(`  Codes: ${ACTIVE_CODE_COUNT} active + ${VOIDED_CODE_COUNT} voided`)

  // 6. Bulk attempts: 30 finished internal_exam sessions (ended_at set → not "active",
  //    so the single-active-session unique index is never touched). Varied scores.
  const sessions: Record<string, unknown>[] = []
  for (let i = 0; i < ATTEMPT_COUNT; i++) {
    const startedMs = ISSUED_BASE + i * 3_600_000
    const correct = i % 11 // 0..10
    sessions.push({
      organization_id: org.id,
      student_id: studentId,
      subject_id: met.id,
      mode: 'internal_exam',
      started_at: new Date(startedMs).toISOString(),
      ended_at: new Date(startedMs + 15 * 60_000).toISOString(),
      total_questions: 10,
      correct_count: correct,
      score_percentage: correct * 10,
      passed: correct * 10 >= 70,
    })
  }
  const { error: sessErr } = await db.from('quiz_sessions').insert(sessions)
  if (sessErr) throw new Error(`Insert sessions: ${sessErr.message}`)
  console.log(`  Attempts: ${ATTEMPT_COUNT} finished internal_exam sessions`)

  console.log('\n--- #907 PAGINATION EVAL READY ---')
  console.log(`\nAdmin login:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`Student login: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log('\nAdmin page:    http://localhost:3000/app/admin/internal-exams')
  console.log(`\nCodes:    ${ACTIVE_CODE_COUNT + VOIDED_CODE_COUNT} total → 2 pages (default view)`)
  console.log(`Attempts: ${ATTEMPT_COUNT} total → 2 pages\n`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
