/**
 * Question import script — reads JSON files, validates reference data exists,
 * uploads images to Supabase Storage, and inserts questions.
 *
 * Usage:
 *   npx tsx apps/web/scripts/import-questions.ts \
 *     --file "QDB/050-Meteorology/050-01 The atmosphere/050-01-01 - .../file.json" \
 *     --base-dir "QDB/050-Meteorology/050-01 The atmosphere/050-01-01 - .../"
 *
 * Env vars required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ImportFileSchema } from '@repo/db/import-schema'
import type { ImportQuestion } from '@repo/db/import-schema'
import { createClient } from '@supabase/supabase-js'

// Load .env.local from apps/web or repo root
function loadEnv() {
  const candidates = [
    resolve(__dirname, '../.env.local'), // apps/web/.env.local
    resolve(__dirname, '../../../.env.local'), // repo root
  ]
  const envPath = candidates.find((p) => existsSync(p))
  if (!envPath) return
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1)
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv()

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ORG_NAME = 'Egmont Aviation'
const ORG_SLUG = 'egmont-aviation'
const ADMIN_EMAIL = 'pilot.oleksandr@proton.me'
const BANK_NAME = 'EASA PPL(A) QDB'
const STORAGE_BUCKET = 'question-images'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { file: string; baseDir: string } {
  const args = process.argv.slice(2)
  let file = ''
  let baseDir = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) file = args[++i]
    if (args[i] === '--base-dir' && args[i + 1]) baseDir = args[++i]
  }

  if (!file) {
    console.error('Usage: --file <path-to-json> [--base-dir <folder-with-images>]')
    process.exit(1)
  }

  if (!baseDir) baseDir = dirname(file)

  return { file: resolve(file), baseDir: resolve(baseDir) }
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Bootstrap: org, user, question bank
// ---------------------------------------------------------------------------

async function bootstrapOrg(db: ReturnType<typeof createClient>) {
  const { data, error } = await db
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: ORG_SLUG }, { onConflict: 'slug' })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to upsert org: ${error.message}`)
  console.log(`  Org: ${ORG_NAME} (${data.id})`)
  return data.id as string
}

async function bootstrapUser(db: ReturnType<typeof createClient>, orgId: string) {
  // Check if auth user exists
  const { data: authUsers } = await db.auth.admin.listUsers()
  let authUser = authUsers?.users?.find((u) => u.email === ADMIN_EMAIL)

  if (!authUser) {
    const { data: created, error } = await db.auth.admin.createUser({
      email: ADMIN_EMAIL,
      email_confirm: true,
    })
    if (error) throw new Error(`Failed to create auth user: ${error.message}`)
    authUser = created.user
    console.log(`  Auth user created: ${ADMIN_EMAIL}`)
  } else {
    console.log(`  Auth user exists: ${ADMIN_EMAIL}`)
  }

  // Upsert public.users row
  const { error: upsertErr } = await db.from('users').upsert(
    {
      id: authUser.id,
      organization_id: orgId,
      email: ADMIN_EMAIL,
      full_name: 'Oleksandr',
      role: 'admin',
    },
    { onConflict: 'id' },
  )
  if (upsertErr) throw new Error(`Failed to upsert user: ${upsertErr.message}`)

  console.log(`  User: ${ADMIN_EMAIL} (${authUser.id})`)
  return authUser.id
}

async function bootstrapBank(db: ReturnType<typeof createClient>, orgId: string, userId: string) {
  // Check if bank already exists
  const { data: existing } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', BANK_NAME)
    .is('deleted_at', null)
    .single()

  if (existing) {
    console.log(`  Bank: ${BANK_NAME} (${existing.id})`)
    return existing.id as string
  }

  const { data, error } = await db
    .from('question_banks')
    .insert({ organization_id: orgId, name: BANK_NAME, created_by: userId })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create bank: ${error.message}`)
  console.log(`  Bank: ${BANK_NAME} (${data.id})`)
  return data.id as string
}

// ---------------------------------------------------------------------------
// Reference data: subject, topic, subtopic
// ---------------------------------------------------------------------------

type RefIds = {
  subjectId: string
  topicId: string | null
  subtopicId: string | null
}

// Parse folder path to extract topic/subtopic metadata
// e.g. "QDB/050-Meteorology/050-01 The atmosphere/050-01-01 - Composition..."
function parseFolderPath(baseDir: string) {
  const parts = baseDir.replace(/\\/g, '/').split('/')
  let topicCode: string | null = null
  let topicName: string | null = null
  let subtopicCode: string | null = null
  let subtopicName: string | null = null

  for (const part of parts) {
    // Match topic: "050-01 The atmosphere"
    const topicMatch = part.match(/^(\d{3}-\d{2})\s+(.+)$/)
    if (topicMatch) {
      topicCode = topicMatch[1]
      topicName = topicMatch[2]
    }

    // Match subtopic: "050-01-01 - Composition, extent and vertical division"
    const subtopicMatch = part.match(/^(\d{3}-\d{2}-\d{2})\s+-\s+(.+)$/)
    if (subtopicMatch) {
      subtopicCode = subtopicMatch[1]
      subtopicName = subtopicMatch[2]
    }
  }

  return { topicCode, topicName, subtopicCode, subtopicName }
}

async function lookupSubject(db: ReturnType<typeof createClient>, code: string) {
  const { data, error } = await db.from('easa_subjects').select('id').eq('code', code).single()

  if (error || !data) {
    throw new Error(
      `Subject code '${code}' not found in database. Add it via /app/admin/syllabus first.`,
    )
  }
  return data.id as string
}

async function lookupTopic(db: ReturnType<typeof createClient>, subjectId: string, code: string) {
  const { data, error } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('code', code)
    .single()

  if (error || !data) {
    throw new Error(
      `Topic code '${code}' not found in database. Add it via /app/admin/syllabus first.`,
    )
  }
  return data.id as string
}

async function lookupSubtopic(db: ReturnType<typeof createClient>, topicId: string, code: string) {
  const { data, error } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', topicId)
    .eq('code', code)
    .single()

  if (error || !data) {
    throw new Error(
      `Subtopic code '${code}' not found in database. Add it via /app/admin/syllabus first.`,
    )
  }
  return data.id as string
}

async function resolveRefs(
  db: ReturnType<typeof createClient>,
  question: ImportQuestion,
  folderMeta: ReturnType<typeof parseFolderPath>,
): Promise<RefIds> {
  // Subject — always from the question data
  const subjectId = await lookupSubject(db, question.subject)

  // Topic — from question JSON or folder path
  const topicCode = question.topic ?? folderMeta.topicCode
  let topicId: string | null = null
  if (topicCode) {
    topicId = await lookupTopic(db, subjectId, topicCode)
  }

  // Subtopic — from question JSON or folder path
  const subtopicCode = question.subtopic ?? folderMeta.subtopicCode
  let subtopicId: string | null = null
  if (topicId && subtopicCode) {
    subtopicId = await lookupSubtopic(db, topicId, subtopicCode)
  }

  return { subjectId, topicId, subtopicId }
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

async function ensureBucket(db: ReturnType<typeof createClient>) {
  const { data: buckets } = await db.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === STORAGE_BUCKET)
  if (!exists) {
    const { error } = await db.storage.createBucket(STORAGE_BUCKET, { public: true })
    if (error && !error.message.includes('already exists')) {
      throw new Error(`Failed to create bucket: ${error.message}`)
    }
    console.log(`  Storage bucket created: ${STORAGE_BUCKET}`)
  }
}

async function uploadImage(
  db: ReturnType<typeof createClient>,
  baseDir: string,
  filename: string,
  subjectCode: string,
): Promise<string> {
  const localPath = join(baseDir, filename)
  if (!existsSync(localPath)) {
    console.warn(`  WARNING: Image not found: ${localPath}`)
    return filename // Return original filename as fallback
  }

  const fileBuffer = readFileSync(localPath)
  const storagePath = `${subjectCode}/${filename}`

  const { error } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, fileBuffer, {
    contentType: guessContentType(filename),
    upsert: true,
  })

  if (error) {
    console.warn(`  WARNING: Upload failed for ${filename}: ${error.message}`)
    return filename
  }

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// Question insert
// ---------------------------------------------------------------------------

async function insertQuestion(
  db: ReturnType<typeof createClient>,
  opts: {
    orgId: string
    bankId: string
    userId: string
    question: ImportQuestion
    refs: RefIds
    questionImageUrl: string | null
    explanationImageUrl: string | null
  },
) {
  const { orgId, bankId, userId, question, refs } = opts

  if (!refs.topicId) {
    throw new Error(`Q${question.question_number}: topic_id is required but missing`)
  }

  // Dedup by question_number within the same bank
  const { data: existing } = await db
    .from('questions')
    .select('id')
    .eq('bank_id', bankId)
    .eq('question_number', question.question_number)
    .is('deleted_at', null)
    .limit(1)

  if (existing && existing.length > 0) {
    return { status: 'skipped' as const, id: existing[0].id }
  }

  const { data, error } = await db
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      question_number: question.question_number,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: refs.subtopicId,
      lo_reference: question.lo_reference,
      question_text: question.question_text,
      question_image_url: opts.questionImageUrl,
      options: question.options as unknown as Record<string, unknown>,
      explanation_text: question.explanation_text,
      explanation_image_url: opts.explanationImageUrl,
      difficulty: question.difficulty ?? 'medium',
      status: 'active',
      created_by: userId,
    })
    .select('id')
    .single()

  if (error)
    throw new Error(`Failed to insert question ${question.question_number}: ${error.message}`)
  return { status: 'inserted' as const, id: data.id }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { file, baseDir } = parseArgs()
  console.log(`\nImporting questions from: ${file}`)
  console.log(`Image base dir: ${baseDir}\n`)

  // Load and validate JSON
  const raw = readFileSync(file, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = ImportFileSchema.safeParse(parsed)

  if (!result.success) {
    console.error('Validation errors:')
    for (const issue of result.error.issues) {
      console.error(`  [${issue.path.join('.')}] ${issue.message}`)
    }
    process.exit(1)
  }

  const questions = result.data
  console.log(`Validated ${questions.length} questions\n`)

  // Init
  const db = createAdminClient()
  const folderMeta = parseFolderPath(baseDir)

  // Bootstrap
  console.log('Bootstrap:')
  const orgId = await bootstrapOrg(db)
  const userId = await bootstrapUser(db, orgId)
  const bankId = await bootstrapBank(db, orgId, userId)
  await ensureBucket(db)
  console.log()

  // Resolve refs (subject/topic/subtopic) — do once since all questions share them
  console.log('Reference data:')
  const refs = await resolveRefs(db, questions[0], folderMeta)
  console.log(`  Subject: ${questions[0].subject} → ${refs.subjectId}`)
  if (refs.topicId) console.log(`  Topic: ${folderMeta.topicCode} → ${refs.topicId}`)
  if (refs.subtopicId) console.log(`  Subtopic: ${folderMeta.subtopicCode} → ${refs.subtopicId}`)
  console.log()

  // Import questions
  console.log('Importing questions:')
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const question of questions) {
    try {
      // Upload images if present
      let questionImageUrl: string | null = null
      let explanationImageUrl: string | null = null

      if (question.question_image_url) {
        questionImageUrl = await uploadImage(
          db,
          baseDir,
          question.question_image_url,
          question.subject,
        )
      }
      if (question.explanation_image_url) {
        explanationImageUrl = await uploadImage(
          db,
          baseDir,
          question.explanation_image_url,
          question.subject,
        )
      }

      const res = await insertQuestion(db, {
        orgId,
        bankId,
        userId,
        question,
        refs,
        questionImageUrl,
        explanationImageUrl,
      })

      if (res.status === 'inserted') {
        inserted++
        console.log(`  ✓ Q${question.question_number} inserted`)
      } else {
        skipped++
        console.log(`  - Q${question.question_number} skipped (exists)`)
      }
    } catch (err) {
      errors++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ Q${question.question_number} error: ${msg}`)
    }
  }

  // Summary
  console.log('\n--- Summary ---')
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Errors:   ${errors}`)
  console.log(`  Total:    ${questions.length}\n`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
