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
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

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

const PRACTICE_MODES = ['quick_quiz', 'smart_review']
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main(): Promise<void> {
  // 1. Collect every session id referenced by a saved draft.
  const { data: drafts, error: draftErr } = await db.from('quiz_drafts').select('session_config')
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
  const { data: cleaned, error: updErr } = await db
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', [...referenced])
    .in('mode', PRACTICE_MODES)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (updErr) throw new Error(`cleanup update: ${updErr.message}`)

  const count = cleaned?.length ?? 0
  console.log(`Target: ${SUPABASE_URL}${FORCE_REMOTE ? '  [REMOTE]' : '  [local]'}`)
  if (count > 0) {
    console.log(`Soft-deleted ${count} orphaned active practice session(s).`)
  } else {
    console.log('No orphaned active practice sessions found (already clean).')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
