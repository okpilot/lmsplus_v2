/**
 * Importer for curated VFR RT question content (Parts 1–3).
 *
 * Reads one or more content JSON files (see scripts/content/vfr-rt-*.json) and
 * inserts the corresponding `questions` rows. The DEFAULT path is insert-only + idempotent: a
 * question already present (matched by bank_id + question_number) is skipped, never mutated.
 * Two flags depart from that and are gated accordingly — `--replace` (local only) and
 * `--sync-content` (the narrow answer-key update); both are described below.
 *
 * Syllabus placement: `subject_code` and `topic_code` are required; `subtopic_code` (file-level,
 * overridable per question with `subtopic`) is OPTIONAL, and a file declaring neither imports
 * with `subtopic_id` NULL — Parts 1 and 2 are flat by design, only Part 3 is split into subareas.
 * An unresolvable subtopic code aborts the run before anything is written.
 *
 * Local (default): bootstraps the shared eval org + admin/student logins + bank so
 * you can drill the content at /app/vfr-rt immediately.
 * Remote (--force-remote): looks up the target org + an existing admin (created_by)
 * and the bank; never creates auth users. Refuses non-local URLs without the flag.
 *
 * --replace (LOCAL ONLY): reconciles a DB SCOPE (bank + topic + question_type) against every file
 * the run passes for that scope, via `planScope` (replace-planning.ts, pure — no DB I/O). A number
 * a file still authors and that is already live is UPDATED IN PLACE, preserving its id — never
 * soft-delete + re-insert, which used to mint a fresh id on every re-run and silently orphan any
 * session that had already frozen the old one in `config.question_ids` (#1191). A number the file
 * authors that isn't live yet is inserted, same as the default path.
 *
 * A number live in the scope that NO file in the run authors is UNACCOUNTED, and the run ABORTS
 * naming them. It does not delete them unless you also pass --prune. A pool is a FILE but the
 * scope is bank+topic+question_type, and several files share one — the three Part 3 MC files are
 * all P3_MC/multiple_choice — so "not in the file I passed" and "deleted from the content" are
 * indistinguishable here, and guessing wrong silently deleted 16 live sibling questions. --prune
 * is how you say you meant it. Refused outright with
 * --force-remote, and refused unless the target URL's HOST is this machine (isLocalSupabaseUrl —
 * a stricter check than the prefix match above, which reads `http://localhost.example.com` as
 * local).
 *
 * --sync-content: the ONE narrow update path, for correcting an answer key on rows that are
 * already live. It exists because the two paths above cannot do it — insertIfMissing skips
 * anything already present, and --replace is refused under --force-remote because soft-deleting
 * live prod questions is not an acceptable way to edit one string. See runSyncContent for the
 * full contract; it is dry-run unless --apply is also passed.
 *
 * NOT motivated by an outstanding CAVOK drift — that was a false premise. A pre-push review
 * asserted prod still served `Ceiling and Visibility OK`; a read-only probe of prod on
 * 2026-08-15 disproved it (canonical, synonyms and explanation_text all already match the file,
 * because the Part 1 import ran AFTER the a58e4d49 correction). This mode is a general
 * capability for the NEXT such correction, not a repair for an existing one. Do not run it
 * against prod expecting to find drift; run the dry run first and believe it when it reports
 * nothing to do.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/import-vfr-rt-content.ts                       # imports Part 1 locally
 *   npx tsx scripts/import-vfr-rt-content.ts content/foo.json bar.json
 *   npx tsx scripts/import-vfr-rt-content.ts --force-remote        # prod (needs existing org+admin)
 *   npx tsx scripts/import-vfr-rt-content.ts scripts/content/foo.json --replace   # local re-import
 *   # pass EVERY file sharing the scope, or the run aborts naming the rows no file claims:
 *   npx tsx scripts/import-vfr-rt-content.ts scripts/content/vfr-rt-part3-mc-*.json --replace
 *   # ...and --prune only when you intend those unclaimed rows to be soft-deleted:
 *   npx tsx scripts/import-vfr-rt-content.ts scripts/content/foo.json --replace --prune
 *   # answer-key correction, dry run then apply. --expect-canonical is the value you expect to
 *   # find LIVE (the pre-correction one), not the value in the file. The placeholder below is
 *   # deliberately not the CAVOK string — that drift was the false premise disproved above, and
 *   # a copy-paste-ready invocation carrying it would re-teach the premise this docblock retires.
 *   npx tsx scripts/import-vfr-rt-content.ts --force-remote --sync-content --expect-canonical="<live value being replaced>"
 *   npx tsx scripts/import-vfr-rt-content.ts --force-remote --sync-content --expect-canonical="<live value being replaced>" --apply
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { DIAGRAM_IMAGE_REFS } from '../app/app/quiz/session/_components/diagrams/diagram-refs'
import {
  RWY_2709_IMAGE_REF,
  RWY_2709_LABELS,
  RWY_2709_ZONES,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'
import { fetchAllRows } from '../lib/supabase-paginate'
import {
  assertReleasedForRemote,
  isLocalSupabaseUrl,
  requireRecord,
  requireText,
} from './content-assertions'
import { assertDiagramConfig, type DiagramLabel, type DiagramZone } from './diagram-content'
import {
  assertDialogFillAuthoring,
  assertDialogFillItem,
  composeDialogTemplate,
  type DialogFillItem,
  toStoredBlanks,
} from './dialog-fill-content'
import { type AuthoredMcQuestion, assertMcItem, assertMcKeyBalance } from './mc-content'
import { assertOrderingItems, buildOrderingItems } from './ordering-content'
import { decideUnaccounted, planScope, type ReplacePlan } from './replace-planning'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// TWO DIFFERENT THINGS, deliberately named apart (#1221).
//   FORCE_REMOTE   = PERMISSION. "I accept that this may write to a remote database."
//   isRemoteTarget = FACT.       "The resolved URL is not local."
// The flag never redirects the target — only `.env.remote` does. Keying a branch or a label on
// the flag therefore reports an INTENTION as if it were the target, which is how an operator who
// passed --force-remote without sourcing .env.remote watched rows insert under a `[REMOTE]`
// banner and believed production had the content.
const FORCE_REMOTE = process.argv.includes('--force-remote')
const isRemoteTarget = !isLocalSupabaseUrl(SUPABASE_URL)
// isLocalSupabaseUrl parses the URL and compares the HOSTNAME. It replaces a former
// `startsWith('http://localhost')` prefix test this file also carried: a prefix match accepts
// `http://localhost.evil.com` as local, and keeping two predicates for one fact is what let the
// label drift from the guard. One predicate now, the stricter of the two.
if (isRemoteTarget && !FORCE_REMOTE) {
  console.error(
    `Refusing to import against non-local Supabase URL: ${SUPABASE_URL}\nPass --force-remote to override.`,
  )
  process.exit(1)
}
// The inverse mistake, and the one #1221 was filed for: the flag passed at a LOCAL target. Always
// an error, never an intent — the operator meant to reach production and did not. Fail closed
// rather than print `[REMOTE]` over a local write.
if (FORCE_REMOTE && !isRemoteTarget) {
  console.error(
    `--force-remote was passed but the resolved Supabase URL is LOCAL: ${SUPABASE_URL}\n` +
      'The flag grants permission; it does not change the target. Source apps/web/.env.remote first.',
  )
  process.exit(1)
}

// --replace soft-deletes existing rows, so it is gated harder than the import itself and its
// gates run HERE, at module load: the process exits before createClient below and therefore
// before resolveOrgId / resolveAdminId / ensureBank perform any write.
const REPLACE = process.argv.includes('--replace')
// Independent of --force-remote by design: that flag bypasses the refusal above only, and must
// never unlock a destructive re-import. Rejected before the URL is even considered.
if (REPLACE && FORCE_REMOTE) {
  console.error('--replace is local-only and cannot be combined with --force-remote.')
  process.exit(1)
}
if (REPLACE && isRemoteTarget) {
  console.error(`Refusing --replace against a non-local Supabase URL: ${SUPABASE_URL}`)
  process.exit(1)
}
// Pruning (soft-deleting live rows that NO file in this run authors) is opt-in, because the
// orphan scope is bank+topic+question_type and a POOL IS A FILE — three Part 3 MC files share
// `P3_MC`/`multiple_choice`, so re-importing one of them alone sees the other two's 16 rows as
// "no longer authored". Defaulting to prune turned a single-file re-import into silent deletion
// of its siblings. The run now ABORTS on unaccounted rows and names them; --prune is how an
// operator says "yes, delete those".
const PRUNE = process.argv.includes('--prune')
if (PRUNE && !REPLACE) {
  console.error('--prune only means anything with --replace.')
  process.exit(1)
}

// --sync-content updates live rows in place. Its gates run here, at module load, for the same
// reason --replace's do: the process exits before createClient below, so no resolver runs and
// nothing is written on a mis-invocation.
const SYNC_CONTENT = process.argv.includes('--sync-content')
// Dry run unless --apply. The default is the safe one because the operator's mental model of
// what is live is exactly what --sync-content exists to correct — so it must be possible to see
// the intended writes before making them.
const SYNC_APPLY = process.argv.includes('--apply')
const EXPECT_CANONICAL_PREFIX = '--expect-canonical='
// Trimmed at the parse site so the emptiness check below and the equality check in
// assertSyncPreconditions test the SAME value. Validating `.trim()` while comparing the raw
// string let `--expect-canonical=" Cleared to land "` pass validation and then fail the compare
// against a live `Cleared to land`, reporting "not in the state you expected" for what is
// actually a shell-quoting slip. A canonical never carries meaningful edge whitespace —
// normalize_answer trims, and the DB CHECK stores authored content.
const EXPECT_CANONICAL = process.argv
  .find((a) => a.startsWith(EXPECT_CANONICAL_PREFIX))
  ?.slice(EXPECT_CANONICAL_PREFIX.length)
  ?.trim()
// Both mutate the same rows by different means; combining them is never what anyone meant, and
// the failure would be silent (--replace soft-deletes the rows --sync-content then cannot find).
if (SYNC_CONTENT && REPLACE) {
  console.error('--sync-content and --replace are mutually exclusive.')
  process.exit(1)
}
// The optimistic guard. The content file carries only the NEW canonical, so the PREVIOUS value
// is not derivable from it — the operator has to state it, and a row that has drifted from that
// statement is refused rather than overwritten. An empty value is almost always shell quoting
// gone wrong, and would compare equal to nothing, so it is rejected too.
// SCOPE: EXPECT_CANONICAL is ONE value for the whole run, and assertSyncPreconditions requires
// every row that differs from the file to match it. So an invocation corrects one drifted row —
// or several that happen to share an identical live canonical — and correcting two rows whose
// live canonicals differ aborts in the planning phase, before any write. Run it once per
// distinct live value; that is a deliberate fail-closed, not a bug to work around.
if (SYNC_CONTENT && (EXPECT_CANONICAL === undefined || EXPECT_CANONICAL.trim() === '')) {
  console.error(
    '--sync-content requires --expect-canonical="<the canonical_answer currently live>" — it is the optimistic guard, and a drifted row is refused with your own expectation quoted back.',
  )
  process.exit(1)
}
if (SYNC_APPLY && !SYNC_CONTENT) {
  console.error('--apply only means anything with --sync-content.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Shared with the eval seeds so the same local login works everywhere.
const ORG_SLUG = 'egmont-aviation'
const ORG_NAME = 'Egmont Aviation'
const BANK_NAME = 'VFR RT QDB'
const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

// ---- content shape -----------------------------------------------------------

type ShortAnswerItem = {
  num: string
  prompt: string
  canonical: string
  synonyms: string[]
  acronym?: string
  explanation?: string
}
type McItem = {
  num: string
  prompt: string
  options: { id: string; text: string }[]
  correct: string
  explanation?: string
}

/**
 * An authored `ordering` question. `items` is a plain array of STRINGS in canonical order —
 * NOT `ordering-content`'s per-step `OrderingItem` (`{id, text}`), which is the STORED shape
 * `buildOrderingItems` composes from these strings. An author never writes an id, so the array
 * order is the only place the answer lives (scripts/content-ids.ts).
 */
type OrderingItem = {
  num: string
  prompt: string
  items: string[]
  explanation?: string
}

/**
 * An authored `diagram_label` question. `diagram` is typed `unknown` on purpose: it is the
 * COMPACT authoring shape (`{image_ref, answer_by_zone}`), not a stored `diagram_config`, and
 * `assertDiagramAuthoring` is meant to be its only reader — a structural annotation here would
 * be an unchecked promise over parsed JSON.
 */
type DiagramItem = {
  num: string
  prompt: string
  diagram: unknown
  explanation?: string
}

/**
 * Any authored item, whatever its type, may name the subarea it belongs to.
 *
 * Declared as an intersection over the five item types rather than a field on each of them
 * because `DialogFillItem` is owned by ./dialog-fill-content, where a field only this importer
 * reads has no business being. The intersection distributes over the union, so every existing
 * per-branch cast and assertion in buildRow keeps working unchanged.
 */
type AuthoredQuestion = (ShortAnswerItem | McItem | DialogFillItem | OrderingItem | DiagramItem) & {
  /**
   * Per-question override of the file's `subtopic_code`. Optional: a file whose questions all
   * belong to one subarea states it once at file level and no item repeats it.
   */
  subtopic?: string
}

type ContentFile = {
  title: string
  subject_code: string
  topic_code: string
  /**
   * The file-level default subarea for every question in it, resolved against `easa_subtopics`
   * under this file's OWN topic. Optional on purpose: Parts 1 and 2 are deliberately flat (see
   * mig `20260818000100_seed_vfr_rt_part3_subtopics.sql`), and a file that declares neither this
   * nor a per-question `subtopic` imports with `subtopic_id` NULL, exactly as before.
   */
  subtopic_code?: string
  question_type: 'short_answer' | 'multiple_choice' | 'dialog_fill' | 'ordering' | 'diagram_label'
  /**
   * The prod gate. `'released'` is the ONLY value that lets a file reach a remote database;
   * everything else — including absence — is refused by `assertReleasedForRemote`. Typed
   * `unknown` deliberately: this object is a cast over parsed JSON, so a `string` annotation
   * would be an unchecked promise, and the assertion is meant to be the only reader.
   */
  lifecycle?: unknown
  // Free-form prose describing the batch. Gates NOTHING — see assertReleasedForRemote's note on
  // why the guard moved off this field. Read only by humans; the importer never inspects it.
  status?: string
  questions: AuthoredQuestion[]
}

/**
 * The subarea a single question belongs to: its own `subtopic` if it states one, otherwise the
 * file's default. `undefined` means the question is unfiled and `subtopic_id` stays NULL.
 */
function subtopicCodeFor(file: ContentFile, q: AuthoredQuestion): string | undefined {
  return q.subtopic ?? file.subtopic_code
}

// ---- bootstrap helpers -------------------------------------------------------

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id
  // Reached only on the "already been registered" path swallowed above, so the user DOES exist
  // and a "Cannot find user" here is always a lookup defect, never a real absence. Two ways it
  // used to lie: an undestructured `{ error }` reported a transport/permission failure as a
  // missing user, and listUsers() paginates at perPage=50 by DEFAULT — on a project with more
  // than 50 auth users the account was simply on page 2. perPage is stated explicitly so the
  // page size is visible at the call site. 1000 is the API's documented ceiling per page, not a
  // total, so a single-page lookup still misses an account past row 1000: walk until found or a
  // short page ends the set.
  const PER_PAGE = 1000
  // Bounded on purpose. An unbounded `for(;;)` exits only on "found" or a short page, so an API
  // that keeps returning full pages spins forever against the auth endpoint. A cap turns that into
  // a named failure instead of a hang. 100 pages = 100k auth users, far past any real project.
  const MAX_PAGES = 100
  let scanned = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data: users, error: listErr } = await db.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    })
    if (listErr)
      throw new Error(`Listing users to locate ${email} (page ${page}): ${listErr.message}`)
    const batch = users?.users ?? []
    scanned += batch.length
    const existing = batch.find((u) => u.email === email)
    if (existing) return existing.id
    if (batch.length < PER_PAGE) break
  }
  throw new Error(
    `Cannot find user ${email} after scanning ${scanned} auth users (stopped at the ${MAX_PAGES}-page cap if that many were returned) — it exists (creation reported it as already registered), so this is a lookup defect, not a real absence.`,
  )
}

async function ensureUserRow(
  id: string,
  orgId: string,
  email: string,
  role: 'admin' | 'student',
): Promise<void> {
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

async function resolveOrgId(): Promise<string> {
  if (isRemoteTarget) {
    const { data, error } = await db
      .from('organizations')
      .select('id')
      .eq('slug', ORG_SLUG)
      .single()
    if (error || !data) throw new Error(`Org '${ORG_SLUG}' not found on remote: ${error?.message}`)
    return data.id
  }
  const { data, error } = await db
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: ORG_SLUG }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Org upsert: ${error?.message}`)
  return data.id
}

async function resolveAdminId(orgId: string): Promise<string> {
  if (isRemoteTarget) {
    const { data, error } = await db
      .from('users')
      .select('id')
      .eq('organization_id', orgId)
      .eq('role', 'admin')
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (error || !data) throw new Error(`No admin in org for created_by: ${error?.message}`)
    return data.id
  }
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUserRow(adminId, orgId, ADMIN_EMAIL, 'admin')
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUserRow(studentId, orgId, STUDENT_EMAIL, 'student')
  return adminId
}

async function ensureBank(orgId: string, adminId: string): Promise<{ id: string; name: string }> {
  // One bank per org (question_banks_organization_id_key) — reuse whatever bank the org
  // already has REGARDLESS OF NAME. Filtering on name here would miss an existing bank
  // named differently (prod's org holds "EASA PPL(A) QDB") and fall through to an INSERT
  // that hits the UNIQUE(organization_id) constraint with a 23505. A soft-deleted bank is
  // restored, since that UNIQUE covers deleted rows too. BANK_NAME applies on first insert
  // only. Local bootstraps (restore/create) as seed-vfr-rt-training-eval.ts:317 does;
  // --force-remote is lookup-or-throw, like the two resolvers above.
  const { data: existing, error: lookupErr } = await db
    .from('question_banks')
    .select('id, name, deleted_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (lookupErr) throw new Error(`Bank lookup: ${lookupErr.message}`)
  if (existing) {
    if (existing.deleted_at !== null) {
      // Remote is lookup-only, matching resolveOrgId/resolveAdminId above: a soft-deleted
      // prod bank can only be the result of a deliberate manual act, so the operator
      // decides whether to revive it (same stance as import-questions.ts:147).
      if (isRemoteTarget) {
        throw new Error(
          `Org bank "${existing.name}" (${existing.id}) is soft-deleted — restore it manually before importing.`,
        )
      }
      const { data: restored, error: restoreErr } = await db
        .from('question_banks')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', existing.id)
        .select('id')
      if (restoreErr) throw new Error(`Bank restore: ${restoreErr.message}`)
      if (!restored?.length) throw new Error('Bank restore: no rows updated')
    }
    return { id: existing.id, name: existing.name }
  }
  if (isRemoteTarget) {
    throw new Error(
      `No question bank for org ${orgId} on remote — create it deliberately before importing.`,
    )
  }
  const { data, error } = await db
    .from('question_banks')
    .insert({ organization_id: orgId, name: BANK_NAME, created_by: adminId })
    .select('id, name')
    .single()
  if (error || !data) throw new Error(`Bank: ${error?.message}`)
  return { id: data.id, name: data.name }
}

async function lookupSubjectByCode(code: string): Promise<string> {
  // easa_subjects.code is globally UNIQUE (mig 20260311000001), so a bare code is exact.
  const { data, error } = await db.from('easa_subjects').select('id').eq('code', code).single()
  if (error || !data)
    throw new Error(`easa_subjects code='${code}': ${error?.message ?? 'not found'}`)
  return data.id
}

async function lookupTopicByCode(subjectId: string, code: string): Promise<string> {
  // easa_topics is UNIQUE (subject_id, code) — NOT unique on code alone — so the lookup
  // must be subject-scoped or it can resolve another subject's identically-coded topic.
  // Same shape as import-questions.ts:234. A wrong topic_id inserts cleanly (subject_id and
  // topic_id are independent FKs with no cross-consistency CHECK) and the row is then
  // invisible to every sampler, since all of them pin subject AND topic.
  const { data, error } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('code', code)
    .single()
  if (error || !data)
    throw new Error(
      `easa_topics code='${code}' under subject ${subjectId}: ${error?.message ?? 'not found'}`,
    )
  return data.id
}

/**
 * The codes that DO exist under `topicId`, for an unresolvable-code error message. Error path
 * only — a lookup failure here degrades the hint, never the throw that follows it, so it reports
 * what went wrong instead of replacing the caller's error with its own.
 */
async function describeSubtopicCodes(topicId: string): Promise<string> {
  // No `.is('deleted_at', null)`: easa_subtopics has no such column, so filtering it would be a
  // 42703 at runtime (code-style §5). The drift-proof source is the generated
  // `packages/db/src/types.ts` (`public.Tables.easa_subtopics.Row` — id/topic_id/code/name/
  // sort_order), which is also what the mechanical soft-delete guard parses; the original
  // CREATE TABLE in `20260311000001_initial_schema.sql` agrees, and no later migration ALTERs
  // the table except to enable RLS.
  const { data, error } = await db.from('easa_subtopics').select('code').eq('topic_id', topicId)
  if (error) return `<could not list existing codes: ${error.message}>`
  const codes = (data ?? []).map((r) => r.code as string)
  return codes.length > 0 ? codes.join(', ') : '<none — the topic has no subtopics seeded>'
}

async function lookupSubtopicByCode(topicId: string, code: string, at: string): Promise<string> {
  // easa_subtopics is UNIQUE (topic_id, code) — NOT unique on code alone (mig 20260311000001) —
  // so the lookup must be topic-scoped, the same way lookupTopicByCode is subject-scoped. There
  // is no CHECK tying questions.subtopic_id to questions.topic_id (the two are independent FKs),
  // so a code resolved against the wrong topic would insert cleanly and file the question under
  // another topic's subarea.
  const { data, error } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', topicId)
    .eq('code', code)
    .single()
  if (error || !data) {
    // Throwing, never a silent NULL: an unfiled question is invisible to the subarea picker,
    // which is the one outcome a typo'd code must not produce quietly.
    throw new Error(
      `${at}: subtopic code '${code}' not found under topic ${topicId} (${error?.message ?? 'not found'}) — codes under that topic: ${await describeSubtopicCodes(topicId)}`,
    )
  }
  return data.id
}

/**
 * Resolve every DISTINCT subtopic code this file uses — file-level default plus every
 * per-question override — to an id, once, before any row is inserted.
 *
 * Up front for the same reason main() resolves subject and topic up front: resolving inside the
 * insert loop would surface a bad code on question 20 only after 19 rows were committed. A file
 * that names no code at all resolves to an empty map and does no query.
 *
 * Each code is remembered with WHERE it was written, so an unresolvable one points at the field
 * to edit: a typo'd override on one question and a typo'd file-level default are the same error
 * text otherwise, and only one of them is found by reading the top of the file. First writer
 * wins — the code is looked up once, so the label names one origin, and a per-question override
 * is more specific than the default it displaces.
 */
async function resolveSubtopicIds(
  file: ContentFile,
  topicId: string,
  rel: string,
): Promise<Map<string, string>> {
  const origins = new Map<string, string>()
  for (const q of file.questions) {
    const code = subtopicCodeFor(file, q)
    if (code === undefined || origins.has(code)) continue
    origins.set(
      code,
      q.subtopic === undefined ? `${rel}: 'subtopic_code'` : `${rel} (${q.num}): 'subtopic'`,
    )
  }
  const ids = new Map<string, string>()
  for (const [code, at] of origins) {
    ids.set(code, await lookupSubtopicByCode(topicId, code, at))
  }
  return ids
}

// ---- content validation --------------------------------------------------------

// The types buildRow has a branch for — now the full set the DB accepts
// (questions_question_type_check). Keep this list, ContentFile's question_type union, buildRow's
// branches and the per-item validator switch in main() in step with each other.
const SUPPORTED_TYPES = [
  'short_answer',
  'multiple_choice',
  'dialog_fill',
  'ordering',
  'diagram_label',
]

function validateShortAnswerItem(sa: ShortAnswerItem, at: string): void {
  requireText(sa.canonical, `${at} (${sa.num}): 'canonical'`)
  // Not written directly, but interpolated into the fallback explanation, where a
  // non-string would render as "[object Object]: <canonical>".
  if (sa.acronym !== undefined) {
    requireText(sa.acronym, `${at} (${sa.num}): 'acronym'`)
  }
  if (sa.synonyms !== undefined && !Array.isArray(sa.synonyms)) {
    throw new Error(`${at} (${sa.num}): 'synonyms' must be an array when present`)
  }
  // accepted_synonyms is TEXT[], which happily stores a NULL or blank element — it would
  // just never match anything the grader normalizes, so it fails silently at answer time.
  for (const [j, synonym] of (sa.synonyms ?? []).entries()) {
    requireText(synonym, `${at} (${sa.num}): synonyms[${j}]`)
  }
}

// MC validation lives in ./mc-content, the same way dialog_fill's validators live in
// ./dialog-fill-content. BOTH of its gates run here — `assertMcItem` per question in the loop
// below, `assertMcKeyBalance` once per file after it — so the rules the authoring suite
// enforces and the rules the importer enforces cannot drift apart.
//
// It is strictly stricter than the checks it replaced: a question needs at least 2 options,
// option ids must be a LEADING RUN of a..d (a gap leaves the third button labelled "C" while
// its stored id is 'd', since the runner labels from the array index — so any surface showing
// `correct_option_id` as a letter contradicts the screen), and two options may not share text
// after case folding.

// ---- diagram_label authoring -> stored config ----------------------------------

/**
 * The layouts an authored `diagram` may name, keyed by each layout module's own exported
 * `*_IMAGE_REF` const — never a literal repeated here, the same rule
 * `_components/diagrams/registry.ts` follows for the artwork components.
 *
 * This map is why a `diagram_label` content file carries no ids at all. Zone and label ids are
 * DERIVED (zone from `(image_ref, index)`, label from its own text — see scripts/diagram-content.ts),
 * so an author who wrote them by hand would both be guessing digests and gaining a field the
 * zone -> label mapping could be encoded into. The file states an `image_ref` plus a zone-index
 * -> label-TEXT map, and everything carrying an id is looked up from here.
 *
 * `DIAGRAM_IMAGE_REFS` (from `_components/diagrams/diagram-refs.ts`) is the registry's key list and
 * is checked FIRST, so an unknown ref fails against the one list the runner also keys off. This map
 * cannot be replaced by that list: it carries the zones and labels a ref resolves TO, which the ref
 * list does not.
 */
type DiagramLayout = { zones: DiagramZone[]; labels: DiagramLabel[] }
const DIAGRAM_LAYOUTS: Record<string, DiagramLayout> = {
  [RWY_2709_IMAGE_REF]: { zones: RWY_2709_ZONES, labels: RWY_2709_LABELS },
}

/** The COMPACT authoring shape. `answer_by_zone` maps a canonical zone INDEX (as a decimal string
 *  key) to the TEXT of the label that answers it. */
type AuthoredDiagram = { image_ref: string; answer_by_zone: Record<string, string> }

/** What gets stored in `questions.diagram_config`, mirroring `is_valid_diagram_config`'s exact
 *  key set (mig `20260702000100`). */
type ResolvedDiagramConfig = {
  image_ref: string
  zones: DiagramZone[]
  labels: DiagramLabel[]
  answer: { zone_id: string; label_id: string }[]
}

/**
 * Gate over the AUTHORED shape, run in the per-item validator loop so a bad content file fails
 * with a field-level message before any resolution or DB write is attempted.
 *
 * Keys must be in canonical decimal form (`String(Number(key)) === key`): `"00"` and `"0"` would
 * otherwise both name zone 0, and the second would silently overwrite the first in the map.
 */
function assertDiagramAuthoring(raw: unknown, at: string): asserts raw is AuthoredDiagram {
  requireRecord(raw, `${at}: 'diagram'`)
  requireText(raw.image_ref, `${at}: diagram.image_ref`)
  // Checked against the registry's own key list FIRST, so a typo'd ref fails against the same
  // list the runner keys off rather than against this file's private map. A ref the runner does
  // not know renders no artwork (getDiagramComponent fails closed), which imports clean and
  // leaves the question silently un-answerable.
  // `.some`, not `.includes`: DIAGRAM_IMAGE_REFS is an `as const` tuple, so its element type is
  // the literal union and `.includes(string)` is a type error. `.some` compares without
  // narrowing the argument.
  if (!DIAGRAM_IMAGE_REFS.some((ref) => ref === raw.image_ref)) {
    throw new Error(
      `${at}: diagram.image_ref ${JSON.stringify(raw.image_ref)} is not a registered diagram — registered refs: ${DIAGRAM_IMAGE_REFS.join(', ')}`,
    )
  }
  const layout = DIAGRAM_LAYOUTS[raw.image_ref]
  if (!layout) {
    throw new Error(
      `${at}: diagram.image_ref ${JSON.stringify(raw.image_ref)} names no known layout — known refs: ${Object.keys(DIAGRAM_LAYOUTS).join(', ')}`,
    )
  }
  requireRecord(raw.answer_by_zone, `${at}: diagram.answer_by_zone`)
  const entries = Object.entries(raw.answer_by_zone)
  if (entries.length === 0) {
    throw new Error(`${at}: diagram.answer_by_zone must name at least one zone`)
  }
  for (const [key, value] of entries) {
    if (String(Number(key)) !== key || Number(key) < 0 || Number(key) >= layout.zones.length) {
      throw new Error(
        `${at}: diagram.answer_by_zone key ${JSON.stringify(key)} must be a zone index in canonical decimal form between 0 and ${layout.zones.length - 1} for image_ref ${JSON.stringify(raw.image_ref)}`,
      )
    }
    requireText(value, `${at}: diagram.answer_by_zone[${JSON.stringify(key)}]`)
  }
}

/**
 * Resolve the authored shape into the stored `diagram_config`.
 *
 * `zones` holds ONLY the zones the file answers, in ascending canonical-index order — not the
 * layout's full array. `is_valid_diagram_config` requires `answer.length = zones.length` (every
 * delivered zone is answered exactly once), so shipping all 9 zones for a 5-leg question would
 * fail at INSERT. Each zone object is taken from the layout UNCHANGED: its id was derived from
 * its FULL-array index, so subsetting must not renumber it.
 *
 * `labels` is the layout's FULL pool. Labels may outnumber zones — the unused ones are the
 * deliberate distractors (for RWY 27/09, the four turn names plus three more).
 */
function resolveDiagramConfig(authored: AuthoredDiagram, at: string): ResolvedDiagramConfig {
  const layout = DIAGRAM_LAYOUTS[authored.image_ref]
  // Unreachable after assertDiagramAuthoring, which rejects an unknown ref — but this function is
  // exported to buildRow's branch and has to be self-defending about its own lookup.
  if (!layout) {
    throw new Error(`${at}: diagram.image_ref ${JSON.stringify(authored.image_ref)} has no layout`)
  }
  const placements = Object.entries(authored.answer_by_zone)
    .map(([key, text]) => ({ index: Number(key), text }))
    .sort((a, b) => a.index - b.index)
  const answer = placements.map(({ index, text }) => {
    // Index validity is re-derived here rather than trusted from assertDiagramAuthoring: this
    // function is reachable from buildRow independently of that gate, and an out-of-range index
    // would otherwise read `undefined` and store a null zone_id that only fails at INSERT.
    const zone = layout.zones[index]
    if (!zone) {
      throw new Error(
        `${at}: diagram.answer_by_zone names zone index ${index}, but layout ${JSON.stringify(authored.image_ref)} has only ${layout.zones.length} zones`,
      )
    }
    // Exactly-one, not first-match: two labels sharing a text would make the pairing ambiguous,
    // and zero means the file names a chip this layout does not offer (usually a typo or a
    // label the layout renamed).
    const matches = layout.labels.filter((label) => label.text === text)
    if (matches.length !== 1) {
      throw new Error(
        `${at}: diagram.answer_by_zone[${index}] names label text ${JSON.stringify(text)}, which matches ${matches.length} label(s) in layout ${JSON.stringify(authored.image_ref)} — it must match exactly one. Available: ${layout.labels.map((label) => JSON.stringify(label.text)).join(', ')}`,
      )
    }
    const label = matches[0]
    if (!label) throw new Error(`${at}: label match for ${JSON.stringify(text)} vanished`)
    return { zone_id: zone.id, label_id: label.id }
  })
  return {
    image_ref: authored.image_ref,
    // Safe: every index was bounds-checked in the answer pass above, which runs first.
    zones: placements.flatMap(({ index }) => layout.zones[index] ?? []),
    labels: layout.labels,
    answer,
  }
}

// ---- row building ------------------------------------------------------------

type QuestionRow = Record<string, unknown> & { question_number: string }

/**
 * The syllabus placement of ONE row. An object rather than two positional params because
 * `subtopicId` varies per QUESTION (a file may override its default on individual items) while
 * `topicId` is per file, and code-style §3 caps positional params at 3 — buildRow is already at
 * its limit with (file, q, base).
 */
type RowScope = { topicId: string; subtopicId: string | null }

function buildRow(
  file: ContentFile,
  q: AuthoredQuestion,
  base: Record<string, unknown>,
  scope: RowScope,
): QuestionRow {
  // `common` sets every questions_question_type_columns_check discriminator EXPLICITLY, and each
  // branch below overrides only the columns its own type populates. `diagram_config` used to be
  // satisfied by OMISSION — the column defaults to NULL (ADD COLUMN diagram_config JSONB NULL
  // DEFAULT NULL) — which held only while every supported type wanted NULL there. The
  // diagram_label branch needs it NOT NULL, so the value is stated here rather than left to the
  // default; the other four branches inherit the NULL their check clause requires.
  //
  // `subtopic_id` sits here, not in any branch: it is syllabus placement, orthogonal to the type
  // discriminators, and no branch below overrides it — so every one of the five inherits it from
  // this spread, and a new branch gets it for free.
  const common = {
    ...base,
    topic_id: scope.topicId,
    subtopic_id: scope.subtopicId,
    question_number: q.num,
    question_text: q.prompt,
    question_type: file.question_type,
    options: [],
    canonical_answer: null,
    accepted_synonyms: [],
    dialog_template: null,
    blanks_config: [],
    ordering_items: [],
    correct_option_id: null,
    diagram_config: null,
  }
  if (file.question_type === 'short_answer') {
    const sa = q as ShortAnswerItem
    return {
      ...common,
      canonical_answer: sa.canonical,
      accepted_synonyms: sa.synonyms ?? [],
      explanation_text:
        sa.explanation ??
        (sa.acronym ? `${sa.acronym}: ${sa.canonical}` : (base.explanation_text as string)),
    }
  }
  if (file.question_type === 'multiple_choice') {
    const mc = q as McItem
    return {
      ...common,
      options: mc.options,
      correct_option_id: mc.correct,
      explanation_text: mc.explanation ?? (base.explanation_text as string),
    }
  }
  if (file.question_type === 'dialog_fill') {
    // Narrow instead of casting: this branch reads a nested structure, and the assertion is the
    // same one Stage B ran, so a shape drift here is a bug in the loop, not a silent bad row.
    const label = `question '${q.num}'`
    assertDialogFillItem(q, label)
    const blanks = toStoredBlanks(q.blanks)
    return {
      ...common,
      dialog_template: composeDialogTemplate(q.template, blanks, label),
      blanks_config: blanks,
      // `common` spreads `base`, so it already carries an `explanation_text` — the GENERIC
      // fallback. Every branch must re-resolve the authored value or the teaching note is
      // silently replaced by that boilerplate: the column is NOT NULL and `base` satisfies it,
      // so nothing fails and it surfaces only at eval.
      explanation_text: q.explanation ?? (base.explanation_text as string),
    }
  }
  if (file.question_type === 'ordering') {
    const ord = q as OrderingItem
    const label = `question '${q.num}'`
    // Re-assert rather than trust the cast, the same way the dialog_fill branch does: this
    // branch reads a nested structure and buildRow is also reached from the --sync-content plan.
    assertOrderingItems(ord.items, label)
    return {
      ...common,
      // The array order IS the answer key; buildOrderingItems derives each id from the step's own
      // text and preserves that order. `diagram_config` stays NULL, per the ordering branch of
      // questions_question_type_columns_check.
      ordering_items: buildOrderingItems(ord.items, label),
      // Same trap the dialog_fill branch documents: `common` spreads `base`, so a branch that
      // leaves explanation_text unresolved silently ships the generic fallback — the column is
      // NOT NULL and `base` satisfies it, so nothing fails and it surfaces only at eval.
      explanation_text: ord.explanation ?? (base.explanation_text as string),
    }
  }
  if (file.question_type === 'diagram_label') {
    const dg = q as DiagramItem
    const label = `question '${q.num}'`
    assertDiagramAuthoring(dg.diagram, label)
    const config = resolveDiagramConfig(dg.diagram, label)
    // The resolved config passes the SAME gate as any other stored config — including the
    // derived-id rule, which is the answer-oracle invariant and the reason ids are not authored.
    assertDiagramConfig(config, label)
    return {
      ...common,
      diagram_config: config,
      // Restated even though `common` already has it: the diagram_label branch of
      // questions_question_type_columns_check requires ordering_items = '[]' exactly, and this
      // is the one branch where a reader might expect the sibling list column to be populated.
      ordering_items: [],
      explanation_text: dg.explanation ?? (base.explanation_text as string),
    }
  }
  throw new Error(`Unsupported question_type '${file.question_type}' (add a branch in buildRow)`)
}

/**
 * Soft-delete ORPHANED rows under --replace (local only) — rows live in this file's DB scope
 * that `planScope` determined NO file in the run authors (see `planReplaceAll`; only reached
 * under --prune). Rows the file still authors are
 * UPDATED IN PLACE (see `updateReplacedRow`) instead of being soft-deleted here, so their id
 * survives the re-import (#1191). The importer is otherwise insert-only, so an edited question
 * has no effect on re-run without --replace.
 *
 * Scoped to bank + topic + question_type + an explicit `nums` set (the orphaned numbers, not the
 * whole file — see `planReplaceAll`). Do NOT reason about safety from the number PREFIX: the
 * orphan set is derived by an UNFILTERED scope query (`findLiveNumbersInScope`), so every live
 * row in this bank/topic/question_type is a candidate whatever its prefix — including rows
 * authored by a DIFFERENT content file that happens to share the scope, which is exactly what
 * three Part 3 MC files do under `P3_MC`/`multiple_choice`. That is why `planReplaceAll` unions
 * every file in a scope and refuses to prune without `--prune`. Never a hard DELETE — and
 * idx_questions_bank_number is UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL, so the
 * soft delete correctly frees the slot were anything ever re-inserted under that number again.
 */
type ReplaceScope = {
  rel: string
  bankId: string
  topicId: string
  questionType: string
  nums: string[]
}

/**
 * Every LIVE question_number in this scope (bank + topic + question_type), unfiltered by any
 * particular num set — this is what `planScope` diffs the UNION of every file's authored numbers
 * in this scope against, to
 * find orphans (rows the DB has that the file no longer declares). `scope.nums` is ignored here;
 * pass whichever ReplaceScope is convenient, its `nums` field is irrelevant to this query.
 */
async function findLiveNumbersInScope(scope: ReplaceScope): Promise<string[]> {
  // PAGINATED, and it must be. PostgREST caps a response at max_rows = 1000
  // (supabase/config.toml), and this query is deliberately UNFILTERED by number — it reads every
  // live row in the scope. A silent truncation here does not merely under-report: numbers missing
  // from `liveNums` fall out of `toUpdate` and into `toInsert`, where `insertIfMissing` matches
  // them on (bank_id, question_number), finds them already live, and SKIPS them. The edited
  // content never lands and the run exits 0 reporting "N inserted / M updated / K skipped" — the
  // silent no-op this file says --replace must never produce. The repo has this truncation on
  // record (#668/#673), which is why `fetchAllRows` exists.
  // getCount and getPage build the SAME filtered query, as fetchAllRows requires — the filters are
  // repeated rather than hoisted because the chain must start at .select() for each.
  const { data, error } = await fetchAllRows<{ question_number: string | null }>(
    () =>
      db
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('bank_id', scope.bankId)
        .eq('topic_id', scope.topicId)
        .eq('question_type', scope.questionType)
        .is('deleted_at', null),
    (from, to) =>
      db
        .from('questions')
        .select('question_number')
        .eq('bank_id', scope.bankId)
        .eq('topic_id', scope.topicId)
        .eq('question_type', scope.questionType)
        .is('deleted_at', null)
        // Total order, and locally so: `question_number` is unique in this scope via the partial
        // index idx_questions_bank_number, but the `id` tiebreaker means a future index change
        // cannot silently make page boundaries unstable. Matches the sibling script's shape.
        .order('question_number', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )
  if (error) throw new Error(`--replace live-number lookup (${scope.rel}): ${error.message}`)
  // question_number is nullable in the schema; a NULL one cannot be authored by a content file,
  // so it is not a candidate for update OR for pruning. Dropping it here keeps it out of both.
  return data.map((r) => r.question_number).filter((n): n is string => n !== null)
}

/**
 * The live rows matching `scope.nums` exactly, filtered exactly as the UPDATE below is, so
 * the count it returns is the count that update must produce. Callers pass the ORPHANED numbers
 * here (see `planReplaceAll`), not the whole file's num set — so the empty case is NOT a normal
 * first import (an empty orphan set means `planReplaceAll` never calls this at all). An empty
 * result warns and returns empty rather than throwing because it is a concurrent-write race
 * safety net; see the body comment for why.
 */
async function findReplaceTargets(scope: ReplaceScope): Promise<{ question_number: string }[]> {
  const { data: matched, error: matchErr } = await db
    .from('questions')
    .select('question_number')
    .eq('bank_id', scope.bankId)
    .eq('topic_id', scope.topicId)
    .eq('question_type', scope.questionType)
    .in('question_number', scope.nums)
    .is('deleted_at', null)
  if (matchErr) throw new Error(`--replace lookup (${scope.rel}): ${matchErr.message}`)
  if (!matched || matched.length === 0) {
    // Unreachable in the normal --replace flow: `planReplaceAll` derives `scope.nums` FROM this
    // same scope's live query (findLiveNumbersInScope) and only calls this with a non-empty
    // orphaned set, so a re-check here should always match. Kept as a fail-closed safety net for
    // a race (another process soft-deleted the row between the two queries) rather than removed —
    // console.WARN, not log: a silent zero-match here would otherwise read as an ordinary
    // progress line while the caller's matched/removed reconciliation below throws on it anyway.
    console.warn(
      `  ${scope.rel}: --replace matched no existing rows (type=${scope.questionType}, topic=${scope.topicId}) among [${scope.nums.join(', ')}] — expected a live match; the rows may have moved or been removed by something else since planning`,
    )
    return []
  }
  return matched as { question_number: string }[]
}

/**
 * Appends every id it soft-deleted to `removedIds`, so a later failure can put every one of them
 * back. The append happens BEFORE the matched/removed reconciliation below throws: that branch
 * fires on a PARTIALLY blocked write, where rows really were soft-deleted, and a rollback list
 * built from the return value would miss exactly those.
 */
async function softDeleteForReplace(
  scope: ReplaceScope,
  adminId: string,
  removedIds: string[],
): Promise<void> {
  const matched = await findReplaceTargets(scope)
  if (matched.length === 0) return
  // Disclosure, not detection: a hostname check cannot see through an SSH tunnel, so print the
  // target and exactly what is about to be soft-deleted before mutating.
  console.log(
    `  ${scope.rel}: --replace soft-deleting ${matched.length} row(s) on ${SUPABASE_URL} — ${matched.map((r) => r.question_number).join(', ')}`,
  )
  // ensureBank's restore path clears deleted_at and deleted_by together, so stamp both here.
  const { data: removed, error } = await db
    .from('questions')
    .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
    .eq('bank_id', scope.bankId)
    .eq('topic_id', scope.topicId)
    .eq('question_type', scope.questionType)
    .in('question_number', scope.nums)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`--replace soft-delete (${scope.rel}): ${error.message}`)
  for (const row of removed ?? []) removedIds.push(row.id as string)
  // code-style §5's "log only when > 0" shape is for cleanup where zero rows is VALID. Here the
  // SELECT above already proved N rows match, so anything less than N means the write was blocked
  // (RLS/grant — see #815) or the rows moved. Throw rather than warn: these are ORPHANED rows —
  // absent from the file by construction — so nothing downstream ever touches their
  // question_number again this run. A silently-incomplete soft-delete here would leave the
  // leftover rows live with no signal, which is exactly the #1191 defect this scope exists to
  // close. A silent no-op is the one outcome --replace must never produce.
  const removedCount = removed?.length ?? 0
  if (removedCount !== matched.length) {
    throw new Error(
      `--replace soft-delete (${scope.rel}): matched ${matched.length} row(s) but updated ${removedCount} — the write was blocked or the rows moved; aborting before re-insert.`,
    )
  }
  console.log(`  ${scope.rel}: --replace soft-deleted ${removedCount} row(s)`)
}

/**
 * Undo a --replace soft-delete after a LATER step failed. Without this, an insert that throws
 * mid-run leaves the file's questions soft-deleted and NOT re-inserted — the content is simply
 * gone from the bank until someone re-runs the importer, and `--replace` is the one flag whose
 * whole purpose is that the operator can see the edit take effect.
 *
 * Per-step accumulator (code-style §7): each id is restored in its own try/catch so one blocked
 * row cannot skip the rest of the rollback. Returns one message per id that could NOT be put
 * back; the caller prints them and still rethrows the ORIGINAL failure, which is the one that
 * explains why the import stopped.
 *
 * Restores `deleted_by` alongside `deleted_at`, matching how both are stamped on the way out and
 * how ensureBank's restore path clears them. Every id here was live (`deleted_at IS NULL`) when
 * it was matched, so nulling both is an exact reversal, not a guess.
 */
async function restoreSoftDeleted(ids: readonly string[]): Promise<string[]> {
  const failures: string[] = []
  for (const id of ids) {
    try {
      const { data, error } = await db
        .from('questions')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      // Zero rows means the write was blocked (RLS/grant — see #815) or the row moved; a 200 OK
      // with no rows would otherwise read as a successful rollback (code-style §5).
      if (!data || data.length === 0) throw new Error('no rows updated — blocked or row moved')
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return failures
}

/**
 * Why this reports subtopic drift instead of just `true`/`false`:
 *
 * `subtopic_id` is written at INSERT and — since #1191 — by local `--replace`'s in-place update
 * (`updateReplacedRow` sends `buildRow`'s CONTENT fields, `subtopic_id` included — it strips `base`'s INSERT defaults; see that function). This function
 * matches on (bank_id, question_number) alone, `--sync-content` touches just the three answer
 * columns and refuses non-`short_answer` files, and `--replace` cannot run against a remote. So
 * on a REMOTE database it is INSERT-only and nothing can move an existing row to a different
 * subtopic; locally, `--replace` can.
 *
 * That makes adding `subtopic_code` to an already-imported pool silently produce a HALF-FILED
 * pool: the questions added in the same edit get the new subtopic, the pre-existing ones keep
 * `subtopic_id` NULL forever. Since `getSubtopicsForTopic` drops any subtopic with
 * `questionCount = 0` but happily shows a partial count, the picker then advertises
 * "Transmission of Numbers - 2 questions" for a 20-question pool, and the plain output
 * ("2 inserted / 18 skipped") is indistinguishable from a healthy no-op. Reading one extra
 * column here is what makes that state observable.
 */
type InsertOutcome =
  | { kind: 'inserted' }
  | { kind: 'skipped'; drift: { stored: string | null; authored: string | null } | null }

async function insertIfMissing(bankId: string, row: QuestionRow): Promise<InsertOutcome> {
  const { data: existing, error: existingErr } = await db
    .from('questions')
    .select('id, subtopic_id')
    .eq('bank_id', bankId)
    .eq('question_number', row.question_number)
    .is('deleted_at', null)
    .limit(1)
  if (existingErr) throw new Error(`Question ${row.question_number} lookup: ${existingErr.message}`)
  const hit = existing?.[0]
  if (hit !== undefined) {
    // The authored value is `string | null` by construction (scopeFor returns one or the other),
    // but this row came back from the DB as `unknown`-ish, so normalize both sides before
    // comparing rather than trusting the column's declared type.
    const stored = (hit.subtopic_id ?? null) as string | null
    const authored = (row.subtopic_id ?? null) as string | null
    return { kind: 'skipped', drift: stored === authored ? null : { stored, authored } }
  }
  const { error } = await db.from('questions').insert(row)
  if (error) throw new Error(`Question ${row.question_number}: ${error.message}`)
  return { kind: 'inserted' }
}

/**
 * --replace, matched-row path (#1191): UPDATE the existing live row's content in place instead
 * of soft-delete + re-insert, so its `id` survives the re-import. A session created before this
 * run may have already frozen the row's id in `config.question_ids`; soft-delete-then-insert
 * silently orphaned that reference onto a NEW id, and the runner kept serving the now-soft-deleted
 * row with no signal. `row` never carries an `id` (buildRow does not set one), and `content` is
 * `row` minus five base keys, so `.update(content)` leaves the target row's id untouched.
 *
 * Scoped the same way `insertIfMissing`'s lookup is (bank_id + question_number, deleted_at IS
 * NULL) — `planReplaceAll` already proved the row is live and in this exact scope before calling
 * this, so a zero-row match here means the plan and the DB disagree; abort rather than guess.
 */
async function updateReplacedRow(bankId: string, row: QuestionRow): Promise<void> {
  // Update CONTENT only. `row` is the full buildRow output, which carries `base` — and base's
  // fields are INSERT defaults, not content: `created_by` records who first authored the row,
  // while `difficulty`/`status` are per-row admin state. Sending the whole row would reassign
  // authorship on every content edit and flip a question an admin had set to `draft` back to
  // `active` (those are the only two values — CHECK status IN ('active','draft')). `bank_id` is the match key; `organization_id` is fixed by it
  // (`question_banks` is UNIQUE per org), so neither can drift.
  const {
    created_by: _createdBy,
    organization_id: _orgId,
    bank_id: _bankId,
    difficulty: _difficulty,
    status: _status,
    ...content
  } = row
  const { data, error } = await db
    .from('questions')
    .update(content)
    .eq('bank_id', bankId)
    .eq('question_number', row.question_number)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`--replace update (${row.question_number}): ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(
      `--replace update (${row.question_number}): matched 0 rows — the row was live when planned but is gone now; aborting.`,
    )
  }
}

type ResolvedFile = {
  rel: string
  file: ContentFile
  subjectId: string
  topicId: string
  /** Every distinct subtopic code the file uses -> its id. Empty for a file that names none. */
  subtopicIds: ReadonlyMap<string, string>
}
type ImportContext = { bankId: string; adminId: string; base: Record<string, unknown> }

/** The syllabus placement of one question, read off the map resolveSubtopicIds already built. */
function scopeFor(entry: ResolvedFile, q: AuthoredQuestion): RowScope {
  const code = subtopicCodeFor(entry.file, q)
  if (code === undefined) return { topicId: entry.topicId, subtopicId: null }
  const subtopicId = entry.subtopicIds.get(code)
  // Unreachable: resolveSubtopicIds walked this same file with this same helper, so every code it
  // can yield is a key here. Stated anyway rather than `?? null`, because the fallback a miss
  // deserves is not a NULL — that is precisely the silent unfiling the throw in
  // lookupSubtopicByCode exists to prevent, arrived at from the other side.
  if (subtopicId === undefined) {
    throw new Error(
      `${entry.rel} (${q.num}): subtopic code '${code}' was never resolved — resolveSubtopicIds and subtopicCodeFor disagree about this file.`,
    )
  }
  return { topicId: entry.topicId, subtopicId }
}

async function insertAll(
  resolved: readonly ResolvedFile[],
  ctx: ImportContext,
  plans: ReadonlyMap<string, ReplacePlan> | null,
): Promise<{ inserted: number; updated: number; skipped: number; drifted: number }> {
  let totalInserted = 0
  let totalUpdated = 0
  let totalSkipped = 0
  const drifted: string[] = []
  for (const entry of resolved) {
    const { rel, file, subjectId } = entry
    // Numbers `planReplaceAll` already proved are live in THIS file's exact scope — update them
    // in place (preserves id, #1191) instead of routing them through insertIfMissing's
    // skip-if-present logic. Empty (a Set, not null) when REPLACE is off or this file matched
    // nothing live, so every question falls through to insertIfMissing as before.
    const toUpdate = new Set(plans?.get(rel)?.toUpdate ?? [])
    let inserted = 0
    let updated = 0
    for (const q of file.questions) {
      const row = buildRow(file, q, { ...ctx.base, subject_id: subjectId }, scopeFor(entry, q))
      if (toUpdate.has(q.num)) {
        await updateReplacedRow(ctx.bankId, row)
        updated++
        continue
      }
      const outcome = await insertIfMissing(ctx.bankId, row)
      if (outcome.kind === 'inserted') inserted++
      else {
        totalSkipped++
        if (outcome.drift !== null) drifted.push(`${rel} ${row.question_number}`)
      }
    }
    totalInserted += inserted
    totalUpdated += updated
    console.log(
      `  ${rel}: ${inserted} inserted / ${updated} updated / ${file.questions.length - inserted - updated} skipped (${file.title}, ${file.question_type})`,
    )
  }
  // Reported AFTER every file is walked, not on the first drifted row: the inserts are
  // idempotent, so completing the pass costs nothing and the operator gets the whole affected
  // list at once instead of rediscovering it one run at a time.
  if (drifted.length > 0) {
    const listed = drifted.map((d) => `  - ${d}`).join('\n')
    // WARN, never throw, under --replace -- but still fail the RUN (see main()). Drift is
    // unreachable for any row `planReplaceAll` put in `toUpdate` (those go through
    // updateReplacedRow above, never insertIfMissing). Getting here means the row's number was
    // NOT live in this file's exact scope (bank + topic + question_type), which happens two ways:
    // the whole file mismatched -- which now surfaces as planReplaceAll's UNACCOUNTED abort, not
    // as a warning -- or individual rows were retyped or moved to a different topic/type since
    // they were first imported, which nothing warns about, because insertIfMissing matches on
    // bank + question_number alone, ignoring topic/type. Do not assert WHICH of the two the
    // operator hit.
    //
    // Throwing here under --replace would still be safe from the OLD rollback-collision concern
    // this comment used to name (soft-deleted rows are now exactly the ORPHANED set, which by
    // construction no insert or update in this same run ever targets again, and since the scope
    // fix that is finally true rather than nearly true) — but --replace's
    // purpose is to force THIS file's own numbers to land, and a drifted row here is a
    // pre-existing filing problem in a DIFFERENT scope that --replace was never asked to fix. So
    // it is reported, not allowed to fail numbers that DID land correctly.
    if (REPLACE) {
      console.warn(
        `  ${drifted.length} question(s) were skipped while filed under a different subtopic than the content file declares:\n${listed}\n  --replace did not match them in this file's scope (bank + topic + question_type), so they were left untouched — their live row's topic_id/question_type differs from what this file declares. A whole-file mismatch aborts earlier as "authored by no file in this run", so reaching this warning means only SOME rows drifted. Fix the file's topic_code/question_type, or refile with a migration.`,
      )
    } else {
      throw new Error(
        `${drifted.length} already-imported question(s) are filed under a different subtopic than the content file now declares, and the INSERT path can never move them:\n${listed}\nThe rows above kept the subtopic they were first inserted with. On a LOCAL database, --replace updates an in-scope match in place and leaves an out-of-scope one (different topic_id/question_type) untouched, exactly like this — it does not move rows across scopes either. Refile with a migration, on any database.`,
      )
    }
  }
  return {
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    drifted: drifted.length,
  }
}

// ---- --sync-content ----------------------------------------------------------
//
// The only path in this file that MUTATES a live question row.
//
// Contract, deliberately narrow:
//   - matches on (bank_id, question_number) with deleted_at IS NULL — that is
//     idx_questions_bank_number, the real UNIQUE index, and the same key insertIfMissing uses.
//     NOT (topic_code, question_number): topic_code is not part of any uniqueness guarantee.
//   - requires EXACTLY ONE live row per content entry; 0 (never imported) and >1 (the unique
//     index is gone) both abort. It never inserts the missing row — an absent question is an
//     import job, not a correction.
//   - writes ONLY canonical_answer, accepted_synonyms and explanation_text. It never touches
//     `status`, so it can neither publish a draft nor retire a live question; and it never
//     deletes.
//   - refuses any file that is not short_answer. dialog_fill answers live in blanks_config, not
//     in these three columns, so it would otherwise report success having changed nothing.
//   - refuses a file that is not `"lifecycle": "released"` UNCONDITIONALLY — not only under
//     --force-remote as the import path does. This path exists to touch already-live rows, so a
//     pilot file is refused even against a local DB.
//
// DRY RUN IS NOT WHOLLY READ-ONLY, LOCALLY. Before it reaches any question, the run resolves an
// org, an admin user and a bank — and against a LOCAL database those resolvers bootstrap
// (upsert organizations, create the auth user, upsert users, create-or-restore question_banks).
// Only the QUESTION writes are gated behind --apply. Against prod this does not apply: under
// --force-remote all three resolvers are lookup-or-throw, so a prod dry run performs ZERO writes
// of any kind. Stated because "dry run" otherwise implies read-only everywhere.
//
// AUDIT GAP, stated because it is real: this writes with the service-role key, straight past the
// Server Action path every admin question mutation goes through, so it records NO `audit_events`
// row. There is no operator-attributable trail of the change beyond this script's own output and
// the commit that changed the content file. That is the accepted cost of a scripted correction;
// anything broader than a keyed answer fix belongs in the admin UI, where it is audited.

type SyncRow = {
  id: string
  canonical_answer: string | null
  accepted_synonyms: string[] | null
  explanation_text: string | null
}
type SyncFields = {
  canonical_answer: string
  accepted_synonyms: string[]
  explanation_text: string
}

async function fetchSyncTarget(bankId: string, questionNumber: string): Promise<SyncRow> {
  const { data, error } = await db
    .from('questions')
    .select('id, canonical_answer, accepted_synonyms, explanation_text')
    .eq('bank_id', bankId)
    .eq('question_number', questionNumber)
    // syncFileContent refuses any non-short_answer FILE (see its guard), but that says nothing
    // about the live ROW: a row of another type carrying this question_number would still match,
    // and the UPDATE would then trip questions_question_type_columns_check mid-write-loop, after
    // earlier rows are already committed — the exact partial write the two-phase plan prevents.
    // Pinning the type here turns that into a clean phase-1 abort via the count check below.
    .eq('question_type', 'short_answer')
    .is('deleted_at', null)
  if (error) throw new Error(`--sync-content lookup '${questionNumber}': ${error.message}`)
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      `--sync-content: expected exactly 1 live row for question_number '${questionNumber}' in bank ${bankId}, found ${Array.isArray(data) ? data.length : 0} — 0 means it was never imported (use the import path), and >1 means idx_questions_bank_number is not doing its job. Either way, aborting before any write.`,
    )
  }
  // Guard the cast rather than trusting it (code-style §5): `db` is an untyped client, so the
  // shape here is an assumption until something checks it.
  const row = data[0] as unknown as SyncRow
  requireText(row.id, `--sync-content: live row for '${questionNumber}' — 'id'`)
  return row
}

/**
 * Read the three synced values off the row buildRow would INSERT, so the update path and the
 * insert path can never disagree about what the file says. Re-guarded because QuestionRow is a
 * `Record<string, unknown>` — nothing structural stops a future branch writing another shape.
 */
function desiredSyncFields(row: QuestionRow, at: string): SyncFields {
  const canonical = row.canonical_answer
  const synonyms = row.accepted_synonyms
  const explanation = row.explanation_text
  requireText(canonical, `${at}: 'canonical_answer'`)
  requireText(explanation, `${at}: 'explanation_text'`)
  if (!Array.isArray(synonyms)) {
    throw new Error(`${at}: 'accepted_synonyms' must be an array (got ${JSON.stringify(synonyms)})`)
  }
  for (const [i, synonym] of synonyms.entries()) {
    requireText(synonym, `${at}: accepted_synonyms[${i}]`)
  }
  // Every element passed requireText immediately above.
  return {
    canonical_answer: canonical,
    accepted_synonyms: synonyms as string[],
    explanation_text: explanation,
  }
}

function alreadyInSync(row: SyncRow, want: SyncFields): boolean {
  return (
    row.canonical_answer === want.canonical_answer &&
    row.explanation_text === want.explanation_text &&
    // Order-sensitive on purpose: accepted_synonyms is a TEXT[] the file authors by hand, so a
    // reorder IS a content change and should be written, not silently treated as equivalent.
    JSON.stringify(row.accepted_synonyms ?? []) === JSON.stringify(want.accepted_synonyms)
  )
}

type SyncPlanEntry = { target: SyncRow; want: SyncFields; at: string }

/**
 * Phase-1 gate: throws if a row that WOULD be written is not in the state the operator declared.
 * Runs over every question before any write, so a mismatch late in the file cannot leave earlier
 * rows already updated.
 *
 * The optimistic check applies only to rows that actually differ, so the operator states the
 * pre-state of the row they came to fix — not of all 40 questions in the file. It guards ONE
 * column: a row whose canonical_answer matches the expectation but whose synonyms or
 * explanation_text have drifted is still overwritten, which is what the per-field dry-run log
 * exists to disclose.
 */
function assertSyncPreconditions(target: SyncRow, want: SyncFields, at: string): void {
  if (alreadyInSync(target, want)) return
  if (target.canonical_answer !== EXPECT_CANONICAL) {
    throw new Error(
      `--sync-content ${at}: refusing to overwrite. The live canonical_answer is ${JSON.stringify(target.canonical_answer)}, but --expect-canonical said ${JSON.stringify(EXPECT_CANONICAL)}. The row is not in the state you expected; re-check before writing.`,
    )
  }
}

/** Returns true when the row needed a change (whether or not --apply actually wrote it). */
async function syncOneQuestion(target: SyncRow, want: SyncFields, at: string): Promise<boolean> {
  if (alreadyInSync(target, want)) return false
  // Enumerate EVERY field the UPDATE will write, not just the canonical. The update sends all of
  // `want`, so printing one field lets a row that differs only in synonyms or explanation_text log
  // a line that reads as a no-op while a real write is queued — and the dry run exists precisely so
  // the operator can see the intended writes before making them. A content correction typically
  // moves more than the canonical — the CAVOK edit that prompted this mode changed all three
  // fields (canonical, synonyms, explanation), even though prod turned out to already have it.
  const changes: string[] = []
  if (target.canonical_answer !== want.canonical_answer) {
    changes.push(
      `canonical ${JSON.stringify(target.canonical_answer)} -> ${JSON.stringify(want.canonical_answer)}`,
    )
  }
  if (JSON.stringify(target.accepted_synonyms) !== JSON.stringify(want.accepted_synonyms)) {
    changes.push(
      `synonyms ${JSON.stringify(target.accepted_synonyms)} -> ${JSON.stringify(want.accepted_synonyms)}`,
    )
  }
  if (target.explanation_text !== want.explanation_text) {
    changes.push(
      `explanation ${JSON.stringify(target.explanation_text)} -> ${JSON.stringify(want.explanation_text)}`,
    )
  }
  console.log(
    `  ${at}: ${changes.join(' | ')}${SYNC_APPLY ? '' : '   [dry run — pass --apply to write]'}`,
  )
  if (!SYNC_APPLY) return true
  // Optimistic predicate on the column assertSyncPreconditions checked at plan time. Planning now
  // spans every file, so the check-then-act window is the whole run rather than one file; matching
  // on the canonical_answer we READ means a concurrent edit yields zero rows and trips the throw
  // below instead of silently clobbering. Never NULL here, which matters because PostgREST `.eq`
  // cannot match NULL: `--sync-content` hard-exits without a non-empty `--expect-canonical`, and
  // assertSyncPreconditions then either returned early on alreadyInSync (so it equals the non-null
  // SyncFields value) or forced it to equal EXPECT_CANONICAL. Independent of the question_type
  // refusal, which guards the FILE; fetchSyncTarget separately pins question_type on the ROW.
  const { data, error } = await db
    .from('questions')
    .update(want)
    .eq('id', target.id)
    .eq('canonical_answer', target.canonical_answer)
    // fetchSyncTarget selected with `.is('deleted_at', null)`, so re-assert it here or the same
    // widened window lets a row soft-deleted between planning and writing be updated anyway —
    // and with 1 row affected, nothing would throw.
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`--sync-content ${at}: ${error.message}`)
  if (data?.length !== 1) {
    throw new Error(
      `--sync-content ${at}: expected 1 row updated, got ${data?.length ?? 0} — the write was blocked (RLS/grant, see #815), or the row was soft-deleted or its canonical_answer changed between planning and writing, or the row moved.`,
    )
  }
  return true
}

async function syncFileContent(entry: ResolvedFile, ctx: ImportContext): Promise<SyncPlanEntry[]> {
  assertReleasedForRemote(entry.file, entry.rel)
  if (entry.file.question_type !== 'short_answer') {
    throw new Error(
      `--sync-content refuses ${entry.rel}: it is ${entry.file.question_type}, and this path writes only canonical_answer / accepted_synonyms / explanation_text. A dialog_fill answer key lives in blanks_config, so syncing it here would report success and change nothing.`,
    )
  }
  // TWO PHASES, deliberately. Resolving and CHECKING every row before writing any of them means a
  // PRECONDITION mismatch on question 20 cannot leave questions 1-19 already updated: there is no
  // transaction here (each update is its own statement), so a mid-loop throw would otherwise stand
  // as a partial write on live rows. Mirrors the up-front validation the import path already does.
  // This does NOT extend to write-phase failures: the optimistic predicate in syncOneQuestion
  // throws from inside the write loop, so concurrent drift detected at question 20 does leave 1-19
  // written. That is the deliberate trade — aborting beats silently clobbering a row someone else
  // just changed — but it is a real partial write, so do not read phase 1 as full atomicity.
  const planned: SyncPlanEntry[] = []
  for (const q of entry.file.questions) {
    const at = `${entry.rel} (${q.num})`
    const row = buildRow(
      entry.file,
      q,
      { ...ctx.base, subject_id: entry.subjectId },
      scopeFor(entry, q),
    )
    const target = await fetchSyncTarget(ctx.bankId, q.num)
    const want = desiredSyncFields(row, at)
    assertSyncPreconditions(target, want, at)
    planned.push({ target, want, at })
  }

  return planned
}

/** Phase 2 for one file: the ONLY place --sync-content writes. */
async function writeSyncPlan(entry: ResolvedFile, planned: SyncPlanEntry[]): Promise<number> {
  let changed = 0
  for (const { target, want, at } of planned) {
    if (await syncOneQuestion(target, want, at)) changed++
  }
  const verb = SYNC_APPLY ? 'updated' : 'would update'
  console.log(
    `  ${entry.rel}: ${verb} ${changed} row(s) / ${entry.file.questions.length - changed} already in sync`,
  )
  return changed
}

async function runSyncContent(
  resolved: readonly ResolvedFile[],
  ctx: ImportContext,
): Promise<void> {
  // Plan EVERY file before writing ANY of them. Per-file phasing was not enough: on a
  // multi-file invocation, file 1's UPDATEs would land before file 2's question_type refusal
  // (the short_answer-only guard at the top of syncFileContent — sync-path-only, since the
  // up-front SUPPORTED_TYPES check admits all five types) and its
  // assertSyncPreconditions ever ran, and those gates exist precisely to fire before anything is
  // written. NOT the lifecycle refusal: main() already runs assertReleasedForRemote over every
  // parsed file before any resolver, so on the --force-remote path — the only one that can write
  // to prod — it has already fired. It is reachable here only on a local run. This is the parity
  // with the import path that the phase comment claims.
  const plans: { entry: ResolvedFile; planned: SyncPlanEntry[] }[] = []
  for (const entry of resolved) plans.push({ entry, planned: await syncFileContent(entry, ctx) })

  let changed = 0
  for (const { entry, planned } of plans) changed += await writeSyncPlan(entry, planned)
  console.log('\nVFR RT content sync complete.')
  console.log(`  Target:   ${SUPABASE_URL}${isRemoteTarget ? '  [REMOTE]' : '  [local]'}`)
  console.log(`  Mode:     ${SYNC_APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'}`)
  console.log(`  Changed:  ${changed}`)
  console.log('  No audit_events row was written — this is a service-role script write.')
}

/**
 * Per-SCOPE --replace planning (#1191). Files are bucketed by (bank, topic, question_type); each
 * bucket queries its live question_numbers ONCE and hands every file in it to `planScope`, which
 * returns per-file UPDATE/INSERT sets plus the scope-level UNACCOUNTED set (live here, authored
 * by no file in this run). `insertAll` then updates the matched numbers IN PLACE, preserving ids.
 *
 * Planning per FILE was the defect. The three Part 3 MC files share one scope, so each one's plan
 * called the other two's 36 rows orphans: a single-file --replace soft-deleted 16 live questions
 * and exited 0, and a multi-file run put the same numbers in one file's toUpdate and another's
 * orphaned at once. Unioning the bucket's files before diffing is what makes "unaccounted" mean
 * "no file authors this" instead of "this file doesn't".
 *
 * UNACCOUNTED rows ABORT the run, naming them and the files given for the scope, unless --prune
 * is passed. A row no file claims is either content deliberately deleted (prune it) or a sibling
 * file the operator forgot to pass (do not) — nothing here can tell those apart, so it refuses to
 * guess rather than guessing destructively.
 *
 * `removedIds` is appended to per bucket and ONLY under --prune, so a throw on a later bucket
 * still leaves the earlier buckets' soft-deleted ids in the caller's rollback list.
 */
async function planReplaceAll(
  resolved: readonly ResolvedFile[],
  ctx: ImportContext,
  removedIds: string[],
): Promise<{ plans: ReadonlyMap<string, ReplacePlan>; orphanedCount: number }> {
  // Bucket by the scope the orphan query actually uses. Planning per FILE was the defect: each
  // file's plan diffed its own nums against every live row in the shared scope, so file B's rows
  // were "orphans" of file A and vice versa — and in a multi-file run the same numbers landed in
  // one file's toUpdate and another's orphaned at once.
  const buckets = new Map<string, { scope: ReplaceScope; files: ResolvedFile[] }>()
  for (const entry of resolved) {
    const key = `${ctx.bankId}\u0000${entry.topicId}\u0000${entry.file.question_type}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.files.push(entry)
      continue
    }
    buckets.set(key, {
      scope: {
        rel: entry.rel,
        bankId: ctx.bankId,
        topicId: entry.topicId,
        questionType: entry.file.question_type,
        nums: [],
      },
      files: [entry],
    })
  }

  const plans = new Map<string, ReplacePlan>()
  let orphanedCount = 0
  for (const { scope, files } of buckets.values()) {
    const liveNums = await findLiveNumbersInScope(scope)
    // The decision itself lives in replace-planning.ts and is unit-tested there against the real
    // three-file P3_MC shape. Keep it that way: this defect survived review because only the
    // per-file `planReplace` was tested, and the scope-level union is where it actually went wrong.
    const scopePlan = planScope({
      files: files.map((f) => ({ rel: f.rel, nums: f.file.questions.map((q) => q.num) })),
      liveNums,
    })

    // FAIL CLOSED. An unaccounted row is live in this scope and authored by no file in THIS run.
    // It is either a question genuinely deleted from the content (#1191's case, which SHOULD be
    // pruned) or a sibling file the operator did not pass (which must not be). Nothing here can
    // tell them apart, so it refuses to guess and makes the operator say which.
    const decision = decideUnaccounted({ unaccounted: scopePlan.unaccounted, prune: PRUNE })
    if (decision === 'abort') {
      throw new Error(
        `--replace: ${scopePlan.unaccounted.length} live row(s) in this scope are authored by no file in this run: ` +
          `${scopePlan.unaccounted.join(', ')}. Files given for this scope: ${files.map((f) => f.rel).join(', ')}. ` +
          'If these were deleted from the content on purpose, re-run with --prune to soft-delete them. ' +
          'If they belong to a sibling file, pass that file too — a pool is a FILE, but the scope is ' +
          'bank+topic+question_type, and several files share one.',
      )
    }
    if (decision === 'prune') {
      console.warn(
        `  --replace --prune: soft-deleting ${scopePlan.unaccounted.length} row(s) authored by no file in this run: ${scopePlan.unaccounted.join(', ')}`,
      )
      // `rel` is the disclosure label. These rows belong to the SCOPE, not to any one file, so
      // naming the bucket's first file here would attribute a deletion to a file that does not
      // author the rows.
      await softDeleteForReplace(
        {
          ...scope,
          rel: `${scope.topicId}/${scope.questionType}`,
          nums: [...scopePlan.unaccounted],
        },
        ctx.adminId,
        removedIds,
      )
      orphanedCount += scopePlan.unaccounted.length
    }

    // Orphans were handled once, at scope level, so every per-file plan carries an empty
    // `orphaned` — nothing downstream may soft-delete again.
    for (const entry of files) {
      const decided = scopePlan.perFile.get(entry.rel)
      if (!decided) throw new Error(`--replace: no plan for ${entry.rel} (internal)`)
      plans.set(entry.rel, { ...decided, orphaned: [] })
    }
  }
  return { plans, orphanedCount }
}

/** Compensating write + its reporting. Never throws: the caller's original error is the one that matters. */
async function rollbackReplace(softDeleted: readonly string[]): Promise<void> {
  console.error(
    `  --replace: import failed after soft-deleting ${softDeleted.length} row(s) — restoring them`,
  )
  const failures = await restoreSoftDeleted(softDeleted)
  if (failures.length === 0) {
    console.error(`  --replace: restored ${softDeleted.length} row(s)`)
    return
  }
  console.error(
    `  --replace: ROLLBACK INCOMPLETE — ${failures.length} row(s) are still soft-deleted: ${failures.join('; ')}`,
  )
  console.error(
    "  --replace: since #1191, the soft-deleted set here is exactly the ORPHANED rows (live in scope but absent from the file) — a number no file in this run declares, so nothing in this run ever re-inserts it. A live replacement occupying the slot therefore points at an external/concurrent write rather than this run's own insert path. idx_questions_bank_number is UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL, so clearing deleted_at collides with whatever is live there. Remedy: re-run the same --replace (it re-derives the orphan set and redoes the soft-delete), or investigate what else wrote that question_number.",
  )
}

/**
 * Soft-delete ORPHANED rows (under --replace) and then update/insert, with a best-effort
 * compensating restore if a later step fails.
 *
 * NOT an all-or-nothing unit. The restore clears `deleted_at` on rows this run soft-deleted
 * (the orphaned set only — matched rows are updated in place, never soft-deleted, so there is
 * nothing to roll back for them), and that succeeds only where the row's `question_number` has
 * NOT been re-occupied by something else in the meantime — the partial-unique index rejects the
 * second live row. So the guarantee is: nothing is lost when the failure happens before any
 * write that could occupy the slot, and a best-effort restore with an explicit ROLLBACK
 * INCOMPLETE report otherwise.
 *
 * The window this closes: --replace soft-deletes the file's orphaned rows, then an update or
 * insert throws (constraint, RLS, dropped connection) and the process exits — those rows are now
 * missing from the bank entirely, which is strictly worse than the no-op --replace exists to
 * prevent. There is no transaction available here (writes are row-at-a-time and individually
 * committed), so the rollback is a compensating write, not an abort.
 *
 * The original failure is always what propagates: a rollback problem is additional information
 * about the same incident, never a replacement for its cause. Rollback failures are logged
 * (code-style §5 — every error path, including compensating ones, emits console.error) and the
 * ids are printed so they can be restored by hand.
 */
async function runImport(
  resolved: readonly ResolvedFile[],
  ctx: ImportContext,
): Promise<{
  inserted: number
  updated: number
  skipped: number
  drifted: number
  orphaned: number
}> {
  const softDeleted: string[] = []
  try {
    // Orphans are a property of the SCOPE, not of any one file, so the count comes back alongside
    // the per-file plans rather than being summed out of them (every per-file plan's `orphaned` is
    // empty by construction — see planReplaceAll).
    const planned = REPLACE ? await planReplaceAll(resolved, ctx, softDeleted) : null
    const orphaned = planned?.orphanedCount ?? 0
    const result = await insertAll(resolved, ctx, planned?.plans ?? null)
    return { ...result, orphaned }
  } catch (err) {
    if (softDeleted.length > 0) await rollbackReplace(softDeleted)
    throw err
  }
}

// ---- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const targets = files.length > 0 ? files : ['scripts/content/vfr-rt-part1-acronyms.json']

  // Parse + validate every field this importer writes, across ALL files, BEFORE touching the
  // DB. Inserts are row-at-a-time and individually committed (no transaction), so a malformed
  // item found at INSERT time leaves earlier rows already written; validating up front turns
  // that half-import into a clean abort.
  //
  // The scope of that guarantee is MALFORMED CONTENT only. It is not a transaction and cannot
  // be: a mid-insert DB failure (constraint, RLS, dropped connection) still commits the rows
  // written before it and leaves the rest unwritten. Re-running is safe — insertIfMissing skips
  // what is already there — but "clean abort" means "a bad content file writes nothing", not
  // "any failure writes nothing". The one destructive case, --replace having already
  // soft-deleted rows the insert then failed to restore, is handled by runImport's rollback.
  //
  // Keep this in step with buildRow — a field buildRow writes but this loop does not check is
  // a field that fails mid-run. The full set buildRow reads from content today: file-level
  // `question_type` ONLY (it does NOT read `subject_code`/`topic_code` — those are validated in
  // this loop but consumed by lookupSubjectByCode/lookupTopicByCode further down, and buildRow
  // sees only the RESOLVED ids via `scope`/`base`); per-item `num`, `prompt`, `explanation`;
  // short_answer `canonical`, `synonyms`, `acronym`; multiple_choice `options`, `correct`;
  // dialog_fill `template`, `blanks` (validated by assertDialogFillItem, which mirrors the DB
  // CHECKs, plus assertDialogFillAuthoring for the house blank-shape rules); ordering `items`
  // (assertOrderingItems, which mirrors the DB CHECK `is_valid_ordering_items`); diagram_label
  // `diagram` — the FULL chain runs here now (assertDiagramAuthoring for the compact authoring
  // shape the file carries, then resolveDiagramConfig + assertDiagramConfig for the stored
  // config, which is what catches a label text matching no chip in the layout). buildRow re-runs
  // that chain when it builds the row; the duplication is deliberate, because resolution is pure
  // and buildRow executes INSIDE the write loop, where a throw would land after earlier rows had
  // already been committed. Everything else it
  // writes is a literal or comes from `base`. When you add a buildRow branch, extend the
  // per-type dispatch below in the same commit — its `default` arm is what turns "no validator
  // yet" into a named abort instead of a misleading MC error.
  //
  // `num` gets the strictest treatment because it is the idempotency key: non-empty string and
  // unique across ALL loaded files (they share one bank). A missing/non-string `num` would
  // otherwise reach the INSERT as question_number NULL, which idx_questions_bank_number
  // (UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL AND question_number IS NOT NULL)
  // exempts — so the row would silently re-insert a duplicate on every re-run.
  const parsed = targets.map((rel) => {
    // readFileSync already names the path in its ENOENT message; JSON.parse's SyntaxError does
    // not, and with several target files the operator cannot tell which one failed.
    const text = readFileSync(resolve(process.cwd(), rel), 'utf8')
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (err) {
      throw new Error(`${rel}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`)
    }
    requireRecord(raw, `${rel}: root`)
    const file = raw as unknown as ContentFile
    requireText(file.subject_code, `${rel}: 'subject_code'`)
    requireText(file.topic_code, `${rel}: 'topic_code'`)
    // Optional — absence means the file is flat (Parts 1 and 2) and its rows carry a NULL
    // subtopic_id. Present means non-blank: `""` would reach lookupSubtopicByCode and fail there
    // with a lookup error instead of a field-level one, after the resolvers have already run.
    if (file.subtopic_code !== undefined) {
      requireText(file.subtopic_code, `${rel}: 'subtopic_code'`)
    }
    // Not read by buildRow — it is interpolated into the per-file completion summary. It is not
    // the ONLY content field outside the buildRow parity contract described ABOVE: `subject_code`
    // and `topic_code` are outside it too, feeding the taxonomy lookups instead. `title` is the
    // one that reaches neither buildRow nor a lookup, so nothing else would catch it. Unvalidated,
    // a missing or object-valued title prints `undefined` / `[object Object]` in the summary.
    requireText(file.title, `${rel}: 'title'`)
    // buildRow throws on an unsupported type, but only once it reaches that item mid-loop.
    if (!SUPPORTED_TYPES.includes(file.question_type)) {
      throw new Error(
        `${rel}: unsupported question_type ${JSON.stringify(file.question_type)} — this importer handles ${SUPPORTED_TYPES.join('/')}; add a buildRow branch first`,
      )
    }
    // Importing makes rows immediately exam-eligible on the target DB, so an un-evaluated batch
    // is the one thing --force-remote must not carry to prod. The gate is a structured
    // `lifecycle` tag, allow-listed to the single value 'released'; a missing or unexpected
    // value is refused. See assertReleasedForRemote for why it is not a prose check.
    if (isRemoteTarget) {
      assertReleasedForRemote(file, rel)
    }
    if (!Array.isArray(file.questions) || file.questions.length === 0) {
      throw new Error(`${rel}: 'questions' must be a non-empty array`)
    }
    return { rel, file }
  })

  const seenNums = new Map<string, string>()
  for (const { rel, file } of parsed) {
    for (const [i, q] of file.questions.entries()) {
      const at = `${rel}[${i}]`
      requireRecord(q, at)
      requireText(q.num, `${at}: 'num'`)
      const prior = seenNums.get(q.num)
      if (prior)
        throw new Error(`Duplicate num '${q.num}' in ${rel} — already declared in ${prior}`)
      seenNums.set(q.num, rel)

      requireText(q.prompt, `${at} (${q.num}): 'prompt'`)
      // Optional on both branches. `buildRow` resolves it with `??`, which only catches
      // null/undefined — so `explanation: ""` would write an empty explanation_text rather
      // than falling back to the generic one. Present means non-blank.
      if (q.explanation !== undefined) {
        requireText(q.explanation, `${at} (${q.num}): 'explanation'`)
      }
      // Same shape, and for the same reason: `subtopicCodeFor` resolves it with `??`, so
      // `subtopic: ""` would override the file default with a blank rather than fall back to it.
      if (q.subtopic !== undefined) {
        requireText(q.subtopic, `${at} (${q.num}): 'subtopic'`)
      }
      // Exhaustive by type, with a throwing default. The previous shape was
      // `if (short_answer) {…} else {…}` where the else was NOT guarded on multiple_choice, so
      // a third type fell into the MC validator and failed with a nonsense
      // "'options' must be a non-empty array". The default arm is redundant with the
      // SUPPORTED_TYPES gate above BY DESIGN — it is the structural guard whose absence was
      // the bug, and it holds even if the two lists drift apart.
      switch (file.question_type) {
        case 'short_answer':
          validateShortAnswerItem(q as ShortAnswerItem, at)
          break
        case 'multiple_choice':
          assertMcItem(q, `${at} (${q.num})`)
          break
        case 'dialog_fill': {
          const label = `${at} (${q.num})`
          assertDialogFillItem(q, label)
          assertDialogFillAuthoring(q, label)
          break
        }
        case 'ordering':
          assertOrderingItems((q as OrderingItem).items, `${at} (${q.num})`)
          break
        case 'diagram_label': {
          const label = `${at} (${q.num})`
          // Bound to a const so the assertion signature narrows it for the resolve call below —
          // asserting on a fresh `(q as DiagramItem).diagram` expression each time narrows
          // nothing, and the second use stays `unknown`.
          const authored = (q as DiagramItem).diagram
          assertDiagramAuthoring(authored, label)
          // Then RESOLVE and gate the stored config here too, even though buildRow does it again.
          // assertDiagramAuthoring only checks the shape the FILE carries — a registered
          // image_ref, in-bounds zone indices, non-blank label text. It cannot tell that
          // "Downwnd leg" matches no chip in the layout, or that two zones name the same chip;
          // those live in resolveDiagramConfig/assertDiagramConfig.
          //
          // buildRow runs per row INSIDE the write loop (see insertAll: buildRow then
          // insertIfMissing, per question), so leaving them there means a typo in question 2
          // throws only after question 1 is committed — and under --force-remote, committed to
          // production. That contradicts this pass's own guarantee that a bad content file
          // writes nothing. Resolution is pure and cheap, so doing it twice costs nothing.
          assertDiagramConfig(resolveDiagramConfig(authored, label), label)
          break
        }
        default:
          throw new Error(
            `${at}: no per-item validator for question_type ${JSON.stringify(file.question_type)} — add one alongside the buildRow branch`,
          )
      }
    }
    // Corpus-level gate, AFTER the per-item loop has validated every question in this file —
    // which is what makes the cast honest. Scoped per file because a "pool" is one content
    // file: two MC files are two independent question sets, and merging their keys could hide
    // a skew in either. Runs at import, not only in the suite, so a new MC content file cannot
    // ship a guessable key merely by arriving without a test.
    if (file.question_type === 'multiple_choice') {
      assertMcKeyBalance(file.questions as AuthoredMcQuestion[], rel)
    }
  }

  // Then the same gate across the UNION of every MC file sharing a topic.
  //
  // Per-file scoping is still correct — a student drilling one subarea draws only that file, so
  // a skew inside it is guessable on its own. But per-file ALONE has a hole that this repo walked
  // straight into: assertMcKeyBalance returns early below MIN_CORPUS_FOR_KEY_BALANCE (12), and
  // splitting Part 3 into subareas turned one 20-question pool into 20 / 11 / 5. The two small
  // files fell under the floor, so 16 of 36 Part 3 MC questions silently stopped being checked —
  // and the split commit and the gate commit were each individually fine. A topic is also a pool
  // a student can draw from, so check it as well; the union clears the floor when the parts do
  // not. Only ONE file for a topic just re-checks that file, which is harmless.
  //
  // Keyed on (subject, topic), not topic alone: a topic is resolved as
  // lookupTopicByCode(subjectId, topic_code), so codes are only unique WITHIN a subject — the
  // same reason easa_subtopics is UNIQUE (topic_id, code) rather than UNIQUE (code). Keying on
  // the code alone would merge two unrelated topics from different subjects into one union and
  // could reject a valid import. No difference today (all Part 3 files are subject RT), which
  // is exactly why it would rot unnoticed.
  //
  // Arity note: the union is STRICTER than the per-file gate when a topic mixes option counts,
  // and can in principle reject content that is fine. addressableIds() is the union of ids any
  // question offers, and the cap is (1 / ids.length) * tolerance — so merging a 2-option file
  // into a 4-option one re-caps the 2-option questions from 80% to 40%, and two individually
  // balanced files can fail together. Not reachable today (every P3_MC file is uniformly
  // 4-option), and the honest fix if it ever bites is to bucket by arity rather than to loosen
  // the tolerance.
  //
  // Scope note: this union spans only the files passed to THIS invocation, so importing one
  // subarea file alone still falls under the floor. That is inherent to a gate that sees only
  // what it is handed; the corpus-wide guarantee lives in mc-content.test.ts, which reads every
  // shipped pool unconditionally.
  const mcByTopic = new Map<string, AuthoredMcQuestion[]>()
  for (const { file } of parsed) {
    if (file.question_type !== 'multiple_choice') continue
    const key = `${file.subject_code}\u0000${file.topic_code}`
    const bucket = mcByTopic.get(key) ?? []
    bucket.push(...(file.questions as AuthoredMcQuestion[]))
    mcByTopic.set(key, bucket)
  }
  for (const [key, questions] of mcByTopic) {
    const [subjectCode, topicCode] = key.split('\u0000')
    assertMcKeyBalance(
      questions,
      `subject ${subjectCode} topic ${topicCode} (union of its multiple_choice files)`,
    )
  }

  // Resolve EVERY file's subject + topic + subtopics before inserting anything. Resolving inside
  // the import loop would surface a bad topic_code in file 2 only after file 1's rows were
  // committed — the same half-import the content validation above exists to prevent. All three
  // lookups throw.
  //
  // These are SELECTs against the global easa_* tables and take no orgId/adminId, so they sit
  // ahead of EVERY write in this function. Against a LOCAL target: resolveOrgId upserts
  // `organizations`, resolveAdminId creates two auth users and upserts two `users` rows, and
  // ensureBank may create a `question_banks` row. Against a REMOTE target all three take their
  // isRemoteTarget branch, which is lookup-or-throw — so the only write in a remote run is the
  // questions insert in insertAll. (That "local" qualifier governs all three, not just
  // resolveOrgId; an earlier form of this comment attached it to the first clause only.)
  //
  // SCOPE OF THE ABORT GUARANTEE — narrower than the earlier wording claimed. Ordering this loop
  // ahead of the resolvers is what makes an abort write nothing, but that holds only for aborts
  // raised UP HERE: content/taxonomy validation, the MC key-balance checks, and this resolution
  // loop. It does NOT hold once execution passes them. resolveAdminId is a four-write sequence
  // and a throw on its third leaves the first two committed; ensureBank's restore path UPDATEs
  // before its own guard can throw; and inserts are row-at-a-time with no transaction, so a
  // mid-insert failure keeps every row already written. The old text said "an import that is
  // going to abort writes nothing at all" without qualification, which is false for all three.
  const resolved: ResolvedFile[] = []
  for (const { rel, file } of parsed) {
    const subjectId = await lookupSubjectByCode(file.subject_code)
    const topicId = await lookupTopicByCode(subjectId, file.topic_code)
    resolved.push({
      rel,
      file,
      subjectId,
      topicId,
      // Scoped by the topic just resolved, not by code alone — easa_subtopics is
      // UNIQUE (topic_id, code), so a bare-code lookup would break the moment another topic
      // reuses one of these codes.
      subtopicIds: await resolveSubtopicIds(file, topicId, rel),
    })
  }

  const orgId = await resolveOrgId()
  const adminId = await resolveAdminId(orgId)
  const bank = await ensureBank(orgId, adminId)

  // Every key here EXCEPT explanation_text is an INSERT default, not content. Add a key and add
  // it to updateReplacedRow's strip list, or local --replace will start writing it as content —
  // nothing mechanical catches that (QuestionRow is Record<string, unknown> and this module is
  // not unit-testable).
  const base = {
    organization_id: orgId,
    bank_id: bank.id,
    explanation_text: 'See standard ICAO/EASA VFR radiotelephony phraseology.',
    difficulty: 'medium' as const,
    status: 'active' as const,
    created_by: adminId,
  }

  const ctx: ImportContext = { bankId: bank.id, adminId, base }

  // Update-only mode: it shares every gate and every resolver above, then takes over instead of
  // the insert path. Returning here is what keeps "never inserts" true.
  if (SYNC_CONTENT) {
    await runSyncContent(resolved, ctx)
    return
  }

  const {
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    drifted,
    orphaned: totalOrphaned,
  } = await runImport(resolved, ctx)

  console.log('\nVFR RT content import complete.')
  console.log(
    `  Target:   ${SUPABASE_URL}${isRemoteTarget ? '  [REMOTE]' : '  [local]'}${REPLACE ? '  [--replace]' : ''}`,
  )
  console.log(`  Org:      ${ORG_NAME} (${orgId})`)
  console.log(`  Bank:     ${bank.name} (${bank.id})`)
  console.log(`  Inserted: ${totalInserted}   Skipped (already present): ${totalSkipped}`)
  // Updated/Orphaned only ever populate under --replace (insertAll's `plans` argument is null
  // otherwise, so both stay 0) — gated on REPLACE rather than printed unconditionally, so the
  // default insert-only path's summary stays exactly as it always was.
  if (REPLACE) {
    console.log(`  Updated:  ${totalUpdated}   Orphaned removed: ${totalOrphaned}`)
  }
  if (!isRemoteTarget) {
    console.log(
      `  Login:    ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}  →  http://localhost:3000/app/vfr-rt`,
    )
  }
  // Set here rather than thrown from insertAll: under --replace a throw would reach runImport's
  // catch and trigger rollbackReplace against the orphaned rows this run already soft-deleted,
  // reporting a bogus incomplete rollback for a run that otherwise worked. Assigning
  // process.exitCode after the summary keeps the non-zero exit — so CI and `&&` chains still
  // fail — without unwinding anything. `exitCode`, not `exit()`: the latter would truncate
  // buffered stdout.
  if (drifted > 0) {
    console.error(
      `\n  ${drifted} question(s) remain filed under a subtopic the content file does not declare — see the warning above. Exiting non-zero.`,
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
