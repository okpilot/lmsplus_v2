/**
 * One-time cleanup for #1085: soft-delete the orphaned ACTIVE practice sessions left
 * behind by the pre-fix "Save for later" (which parked a draft but never ended its
 * quiz_sessions row). Those lingering active rows trip the "unfinished session" banner
 * and the single-active-session guard, blocking new quizzes.
 *
 * Strict orphan match — a session is cleaned ONLY if ALL hold:
 *   - its id equals some quiz_drafts.session_config->>'sessionId' (it belongs to a saved draft)
 *   - mode IN ('quick_quiz','smart_review')  (never touches a graded exam)
 *   - ended_at IS NULL AND deleted_at IS NULL (still active)
 *
 * Idempotent (re-running finds nothing) and safe: after the code fix, new saves close
 * their own session and resume auto-heals legacy drafts, so this only clears the backlog
 * of pre-fix orphans faster than waiting for each user to resume/discard.
 *
 * ⚠️ Run this ONCE, at or just before deploy — BEFORE the resume flow is in active use.
 * A resumed draft points at a currently-active session between resume and the next
 * save/discard; running the script in that window would soft-delete that live in-progress
 * session (it can't distinguish a legacy orphan from a freshly-resumed session by id alone).
 *
 * Local (default): runs against .env.local. Refuses a non-local URL without --force-remote.
 * Prod:  set -a && . ./.env.remote && set +a && npx tsx scripts/cleanup-orphaned-draft-sessions.ts --force-remote
 * (The harness classifier blocks Claude from running a prod WRITE directly — the USER runs it.)
 *
 * Safety flags (recommended for the prod run):
 *   --dry-run          Report the count that WOULD be soft-deleted without mutating.
 *   --cutoff <ISO>     Only touch sessions created before <ISO> — a self-defending guard
 *                      so a run after the fix deploys can't soft-delete a freshly-resumed
 *                      session. Pass the deploy timestamp, e.g. --cutoff 2026-07-04T00:00:00Z.
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fetchAllRows } from '../lib/supabase-paginate'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const FORCE_REMOTE = process.argv.includes('--force-remote')
const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !FORCE_REMOTE) {
  console.error(`Refusing non-local URL without --force-remote: ${SUPABASE_URL}`)
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const cutoffIdx = process.argv.indexOf('--cutoff')
const CUTOFF = cutoffIdx >= 0 ? process.argv[cutoffIdx + 1] : undefined
if (cutoffIdx >= 0 && (!CUTOFF || Number.isNaN(Date.parse(CUTOFF)))) {
  console.error('--cutoff requires a valid ISO timestamp, e.g. --cutoff 2026-07-04T00:00:00Z')
  process.exit(1)
}

const PRACTICE_MODES = ['quick_quiz', 'smart_review']
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Soft-delete (or, in --dry-run, count) the active practice sessions in one id chunk.
 * The mode/ended/deleted filters re-assert the strict orphan match on every chunk; the
 * optional cutoff excludes any session created at/after the deploy timestamp.
 */
async function processChunk(slice: string[]): Promise<number> {
  if (DRY_RUN) {
    let q = db
      .from('quiz_sessions')
      .select('id')
      .in('id', slice)
      .in('mode', PRACTICE_MODES)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (CUTOFF) q = q.lt('created_at', CUTOFF)
    const { data, error } = await q
    if (error) throw new Error(`cleanup dry-run select: ${error.message}`)
    return data?.length ?? 0
  }
  let q = db
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', slice)
    .in('mode', PRACTICE_MODES)
    .is('ended_at', null)
    .is('deleted_at', null)
  if (CUTOFF) q = q.lt('created_at', CUTOFF)
  const { data, error } = await q.select('id')
  if (error) throw new Error(`cleanup update: ${error.message}`)
  return data?.length ?? 0
}

async function main(): Promise<void> {
  // 1. Collect every session id referenced by a saved draft. Paginate: a plain
  // .select() truncates at PostgREST's 1000-row cap, which would silently miss
  // orphans and leave them behind (quiz_drafts holds up to 20 rows per student, so
  // the table can exceed 1000 across an org).
  const { data: drafts, error: draftErr } = await fetchAllRows<{ session_config: unknown }>(
    () => db.from('quiz_drafts').select('*', { count: 'exact', head: true }),
    (from, to) =>
      db
        .from('quiz_drafts')
        .select('session_config')
        .order('id', { ascending: true })
        .range(from, to),
  )
  if (draftErr) throw new Error(`draft scan: ${draftErr.message}`)

  const referenced = new Set<string>()
  for (const d of drafts ?? []) {
    const sid = (d.session_config as { sessionId?: unknown } | null)?.sessionId
    if (typeof sid === 'string' && sid.length > 0) referenced.add(sid)
  }
  console.log(`Draft-referenced session ids: ${referenced.size}`)
  if (referenced.size === 0) {
    console.log('Nothing to clean.')
    return
  }

  // 2. Soft-delete the active practice sessions among them (exam modes excluded).
  // Chunk the id list: a single unbounded .in('id', [...]) risks the PostgREST
  // URL/query-length limit once the orphan backlog is large.
  const ids = [...referenced]
  const CHUNK = 200
  let count = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    count += await processChunk(ids.slice(i, i + CHUNK))
  }
  const scope = FORCE_REMOTE ? '  [REMOTE]' : '  [local]'
  const cutoffNote = CUTOFF ? `  cutoff<${CUTOFF}` : ''
  console.log(`Target: ${SUPABASE_URL}${scope}${DRY_RUN ? '  [DRY-RUN]' : ''}${cutoffNote}`)
  if (count === 0) {
    console.log('No orphaned active practice sessions found (already clean).')
  } else if (DRY_RUN) {
    console.log(`Would soft-delete ${count} orphaned active practice session(s). (dry-run)`)
  } else {
    console.log(`Soft-deleted ${count} orphaned active practice session(s).`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
