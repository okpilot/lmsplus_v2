import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const SERVICE_ROLE_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'

/** Service role client — bypasses RLS, used for setup/teardown */
export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Anon client — subject to RLS, used before auth */
function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Create a test organization, returns its ID */
export async function createTestOrg(opts: {
  admin: SupabaseClient
  name: string
  slug: string
}): Promise<string> {
  const { data, error } = await opts.admin
    .from('organizations')
    .insert({ name: opts.name, slug: opts.slug })
    .select('id')
    .single()
  if (error) throw new Error(`createTestOrg: ${error.message}`)
  return data.id as string
}

/**
 * Create a test user in auth.users + public.users.
 * Returns the user's UUID.
 */
export async function createTestUser(opts: {
  admin: SupabaseClient
  orgId: string
  email: string
  password: string
  role: 'admin' | 'instructor' | 'student'
  fullName?: string
}): Promise<string> {
  // Create in auth.users
  const { data: authData, error: authError } = await opts.admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  })
  if (authError) throw new Error(`createTestUser auth: ${authError.message}`)
  const userId = authData.user.id

  // Insert into public.users
  const { error: userError } = await opts.admin.from('users').insert({
    id: userId,
    organization_id: opts.orgId,
    email: opts.email,
    full_name: opts.fullName ?? opts.email.split('@')[0],
    role: opts.role,
  })
  if (userError) throw new Error(`createTestUser public: ${userError.message}`)

  return userId
}

/** Sign in and return an authenticated Supabase client */
export async function getAuthenticatedClient(opts: {
  email: string
  password: string
}): Promise<SupabaseClient> {
  const client = getAnonClient()
  const { error } = await client.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  })
  if (error) throw new Error(`signIn: ${error.message}`)
  return client
}

/** Seed reference data: subject + topic + subtopic. Returns IDs. */
export async function seedReferenceData(opts: {
  admin: SupabaseClient
  subjectCode: string
  subjectName: string
  topicCode: string
  topicName: string
  subtopicCode?: string
  subtopicName?: string
}): Promise<{ subjectId: string; topicId: string; subtopicId: string | null }> {
  const { admin } = opts

  const { data: subject, error: sErr } = await admin
    .from('easa_subjects')
    .upsert(
      {
        code: opts.subjectCode,
        name: opts.subjectName,
        short: opts.subjectCode,
        sort_order: 1,
      },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (sErr) throw new Error(`seedSubject: ${sErr.message}`)

  const { data: topic, error: tErr } = await admin
    .from('easa_topics')
    .upsert(
      {
        subject_id: subject.id,
        code: opts.topicCode,
        name: opts.topicName,
        sort_order: 1,
      },
      { onConflict: 'subject_id,code' },
    )
    .select('id')
    .single()
  if (tErr) throw new Error(`seedTopic: ${tErr.message}`)

  let subtopicId: string | null = null
  if (opts.subtopicCode && opts.subtopicName) {
    const { data: sub, error: stErr } = await admin
      .from('easa_subtopics')
      .upsert(
        {
          topic_id: topic.id,
          code: opts.subtopicCode,
          name: opts.subtopicName,
          sort_order: 1,
        },
        { onConflict: 'topic_id,code' },
      )
      .select('id')
      .single()
    if (stErr) throw new Error(`seedSubtopic: ${stErr.message}`)
    subtopicId = sub.id
  }

  return { subjectId: subject.id, topicId: topic.id, subtopicId }
}

/** Seed a question bank + questions. Returns bank ID and question IDs. */
export async function seedQuestions(opts: {
  admin: SupabaseClient
  orgId: string
  createdBy: string
  subjectId: string
  topicId: string
  subtopicId?: string | null
  count: number
}): Promise<{ bankId: string; questionIds: string[] }> {
  const { admin, orgId, createdBy, subjectId, topicId, subtopicId } = opts

  const { data: bank, error: bErr } = await admin
    .from('question_banks')
    .insert({
      organization_id: orgId,
      name: `Test Bank ${Date.now()}`,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (bErr) throw new Error(`seedBank: ${bErr.message}`)

  const questions = Array.from({ length: opts.count }, (_, i) => ({
    organization_id: orgId,
    bank_id: bank.id,
    subject_id: subjectId,
    topic_id: topicId,
    subtopic_id: subtopicId ?? null,
    question_text: `Test question ${i + 1}?`,
    options: [
      { id: 'a', text: `Option A ${i}`, correct: false },
      { id: 'b', text: `Option B ${i}`, correct: true },
      { id: 'c', text: `Option C ${i}`, correct: false },
      { id: 'd', text: `Option D ${i}`, correct: false },
    ],
    explanation_text: `Explanation for question ${i + 1}`,
    difficulty: 'medium',
    status: 'active',
    created_by: createdBy,
  }))

  const { data, error: qErr } = await admin.from('questions').insert(questions).select('id')
  if (qErr) throw new Error(`seedQuestions: ${qErr.message}`)

  return {
    bankId: bank.id,
    questionIds: (data as Array<{ id: string }>).map((q) => q.id),
  }
}

/**
 * Clean up all test data created during a test run.
 * Deletes in reverse FK order using the service role client.
 */
export async function cleanupTestData(opts: {
  admin: SupabaseClient
  orgId: string
  userIds: string[]
}) {
  const { admin, orgId, userIds } = opts

  // Delete in FK-safe order
  await admin.from('audit_events').delete().eq('organization_id', orgId)
  await admin.from('fsrs_cards').delete().in('student_id', userIds)
  await admin.from('student_responses').delete().eq('organization_id', orgId)
  await admin
    .from('quiz_session_answers')
    .delete()
    .in(
      'session_id',
      (await admin.from('quiz_sessions').select('id').eq('organization_id', orgId)).data?.map(
        (s: { id: string }) => s.id,
      ) ?? [],
    )
  await admin.from('quiz_sessions').delete().eq('organization_id', orgId)
  await admin.from('questions').delete().eq('organization_id', orgId)
  await admin.from('question_banks').delete().eq('organization_id', orgId)
  await admin.from('users').delete().in('id', userIds)
  await admin.from('organizations').delete().eq('id', orgId)

  // Delete auth users
  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid)
  }
}
