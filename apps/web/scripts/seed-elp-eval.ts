/**
 * Seed script for AI ICAO ELP (oral exam) manual evaluation — Slice 0.
 *
 * Creates:
 * - Egmont Aviation org
 * - Admin user   (admin@lmsplus.local / admin123!)
 * - Student user (student@lmsplus.local / student123!)
 * - One oral_exam_session for the student, all 5 sections recorded, and — via the
 *   service-role grader (write_oral_section_grade), the same path the Edge Function
 *   uses — a full set of canned 1..6 descriptor scores. Section 3 gets fluency=3, so
 *   the weakest-link final level is 3.
 *
 * This lets the evaluator log in and open `/app/elp/report/<session_id>` to see a
 * fully-graded report WITHOUT needing live ElevenLabs/Claude keys (the AI scoring
 * path is exercised separately by deploying the Edge Function with real secrets).
 *
 * Run AFTER `npx supabase db reset`. Idempotent (safe to re-run — it discards any
 * existing active oral session for the student first).
 * Usage: cd apps/web && npx tsx scripts/seed-elp-eval.ts
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE keys in .env.local')
  process.exit(1)
}

const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !process.argv.includes('--force-remote')) {
  console.error(`Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}`)
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'
const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'

const DESCRIPTORS = [
  'pronunciation',
  'structure',
  'vocabulary',
  'fluency',
  'comprehension',
  'interaction',
] as const

function sixScores(level: number, overrides: Record<string, number> = {}) {
  return DESCRIPTORS.map((descriptor) => ({
    descriptor,
    level: overrides[descriptor] ?? level,
    rationale: `seed evidence for ${descriptor}`,
  }))
}

async function ensureOrg(): Promise<string> {
  const { data: existing } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont')
    .maybeSingle()
  if (existing?.id) return existing.id as string
  const { data, error } = await admin
    .from('organizations')
    .insert({ name: 'Egmont Aviation', slug: 'egmont' })
    .select('id')
    .single()
  if (error) throw new Error(`ensureOrg: ${error.message}`)
  return data.id as string
}

async function ensureUser(opts: {
  orgId: string
  email: string
  password: string
  role: 'admin' | 'student'
}): Promise<string> {
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', opts.email)
    .maybeSingle()
  if (existing?.id) return existing.id as string
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  })
  if (authErr || !authData.user) throw new Error(`ensureUser auth: ${authErr?.message}`)
  const userId = authData.user.id
  const { error: insErr } = await admin.from('users').insert({
    id: userId,
    organization_id: opts.orgId,
    email: opts.email,
    full_name: opts.email.split('@')[0],
    role: opts.role,
  })
  if (insErr) throw new Error(`ensureUser insert: ${insErr.message}`)
  return userId
}

async function main() {
  const orgId = await ensureOrg()
  await ensureUser({ orgId, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' })
  const studentId = await ensureUser({
    orgId,
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
    role: 'student',
  })

  // Discard any active oral session so the single-active guard lets us start fresh.
  const { error: clearErr } = await admin
    .from('oral_exam_sessions')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'discarded',
      ended_at: new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (clearErr) throw new Error(`clear active: ${clearErr.message}`)

  // Act as the student for the Class-A RPCs.
  const student = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInErr } = await student.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  })
  if (signInErr) throw new Error(`signIn student: ${signInErr.message}`)

  const { data: startData, error: startErr } = await student.rpc('start_oral_exam_session')
  if (startErr) throw new Error(`start: ${startErr.message}`)
  const sessionId = (startData as { session_id: string }).session_id

  const placeholder = new Blob([new Uint8Array([0x00])], { type: 'audio/webm' })
  for (let n = 1; n <= 5; n++) {
    const path = `${orgId}/${studentId}/${sessionId}/${n}.webm`
    // Service-role upload (bypasses storage RLS) — a real answer would be uploaded by the client.
    const { error: upErr } = await admin.storage
      .from('elp-recordings')
      .upload(path, placeholder, { upsert: true, contentType: 'audio/webm' })
    if (upErr) throw new Error(`upload ${n}: ${upErr.message}`)

    const { data: respId, error: subErr } = await student.rpc('submit_oral_section_response', {
      p_session_id: sessionId,
      p_section_no: n,
      p_audio_path: path,
      p_duration_ms: 12000,
    })
    if (subErr) throw new Error(`submit ${n}: ${subErr.message}`)

    // Simulate the Edge Function grader (service-role) with canned scores.
    const scores = n === 3 ? sixScores(4, { fluency: 3 }) : sixScores(4)
    const { error: gradeErr } = await admin.rpc('write_oral_section_grade', {
      p_response_id: respId as string,
      p_transcript: `Seed transcript for section ${n}.`,
      p_transcript_meta: { words: [] },
      p_descriptor_scores: scores,
      p_usage: [
        { event_type: 'stt_seconds', quantity: 12, provider: 'seed', cost_estimate_micros: null },
      ],
    })
    if (gradeErr) throw new Error(`grade ${n}: ${gradeErr.message}`)
  }

  console.log('✅ ELP seed complete.')
  console.log(`   Student: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log(`   Graded oral exam session: ${sessionId}`)
  console.log(`   Report: /app/elp/report/${sessionId}  (final level = 3, weakest link = fluency)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
