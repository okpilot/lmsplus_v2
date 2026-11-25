import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/** psql as postgres: host psql, else the supabase db container. */
function psql(sql: string): { out: string; err: string } {
  const args = ['-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1']
  let r = spawnSync('psql', ['-h', 'localhost', '-p', '54322', ...args], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  })
  if (r.error) {
    r = spawnSync('docker', ['exec', '-i', 'supabase_db_lmsplusv2', 'psql', ...args], {
      input: sql,
      encoding: 'utf8',
    })
  }
  if (r.error) throw new Error(`psql unavailable: ${r.error.message}`)
  const err = (r.stderr ?? '').trim()
  return { out: (r.stdout ?? '').trim(), err: err || (r.status ? `psql exit ${r.status}` : '') }
}

/** AC-48: privileges, security definer settings and volatility of the new functions. */
describe('exam sitting function privileges', () => {
  // Derive: grep -hoiE 'CREATE (OR REPLACE )?FUNCTION public\.[a-z_]+' supabase/migrations/2026111[678]*.sql | sort -u
  const PUBLIC_RPCS = [
    'create_exam_sitting',
    'update_exam_sitting',
    'start_exam_sitting',
    'close_exam_sitting',
    'cancel_exam_sitting',
    'add_exam_sitting_candidates',
    'remove_exam_sitting_candidates',
    'remove_exam_sitting_entries',
    'list_exam_sittings',
    'get_exam_sitting_summary',
    'get_pending_removal_notices',
    'list_exam_sitting_people',
    'get_exam_sitting_group_add_counts',
    'get_exam_sitting_same_day_people',
    'record_exam_sitting_notice',
    'add_exam_sitting_entries',
    'issue_sitting_exam_codes',
    'get_exam_sitting_issue_preview',
    'get_exam_sitting_subject_eligibility',
    'list_exam_sitting_roster',
    'list_exam_sitting_removed_entries',
    'void_sitting_code',
  ]
  const PRIVATE_FNS = [
    'sitting_day_end',
    'sitting_day_ended',
    'sitting_code_expiry',
    'sitting_admin_guard',
    'sitting_lock',
    'resolve_sitting_students',
    'sitting_resolve_user_ids',
    'sitting_pass_gate',
    'sitting_issue_plan',
    'void_unused_sitting_codes',
    'prune_passed_entries',
    'close_exam_sitting_core',
    'close_expired_sittings',
    'trg_exam_config_sitting_block',
    'insert_internal_exam_code',
    'sitting_pair_state',
    'add_sitting_entries_core',
    'sitting_redeem_gate',
  ]
  const list = (names: string[]) => names.map((n) => `'${n}'`).join(',')

  it('AC-48: authenticated cannot EXECUTE any new private function', () => {
    const { out, err } = psql(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname IN (${list(PRIVATE_FNS)}) AND has_function_privilege('authenticated', p.oid, 'EXECUTE') ORDER BY 1;`,
    )
    expect(err).toBe('')
    expect(out).toBe('')
    const present = psql(
      `SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname IN (${list(PRIVATE_FNS)});`,
    )
    expect(Number(present.out)).toBe(PRIVATE_FNS.length)
  })

  it('AC-48: anon cannot and authenticated can EXECUTE every new public RPC', () => {
    const { out } = psql(
      `SELECT p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE') || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN (${list(PUBLIC_RPCS)}) ORDER BY 1;`,
    )
    const lines = out.split('\n').filter(Boolean)
    expect(lines).toHaveLength(PUBLIC_RPCS.length)
    for (const l of lines) expect(l.endsWith(':false:true'), l).toBe(true)
  })

  it('AC-48: every new public RPC is SECURITY DEFINER with search_path = public, pg_temp', () => {
    const { out } = psql(
      `SELECT p.proname || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN (${list([...PUBLIC_RPCS, 'list_my_active_internal_exam_codes'])}) ORDER BY 1;`,
    )
    const lines = out.split('\n').filter(Boolean)
    expect(lines).toHaveLength(PUBLIC_RPCS.length + 1)
    for (const l of lines) expect(l, l).toMatch(/:true:search_path="?public"?, "?pg_temp"?$/)
  })

  it('AC-48: volatility is STABLE or VOLATILE as specified', () => {
    const stable = [
      'list_exam_sitting_people',
      'get_exam_sitting_group_add_counts',
      'get_exam_sitting_same_day_people',
      'get_pending_removal_notices',
      'sitting_issue_plan',
      'get_exam_sitting_subject_eligibility',
      'list_exam_sitting_roster',
      'list_exam_sitting_removed_entries',
      'get_exam_sitting_issue_preview',
      'sitting_pair_state',
    ]
    const volatile = [
      'list_exam_sittings',
      'get_exam_sitting_summary',
      'start_exam_sitting',
      'list_my_active_internal_exam_codes',
      'add_exam_sitting_entries',
      'issue_sitting_exam_codes',
      'void_sitting_code',
    ]
    const q = (names: string[]) =>
      psql(`SELECT DISTINCT p.provolatile FROM pg_proc p WHERE p.proname IN (${list(names)});`).out
    expect(q(stable)).toBe('s')
    expect(q(volatile)).toBe('v')
    const counts = psql(
      `SELECT count(*) FROM pg_proc WHERE proname IN (${list([...stable, ...volatile])});`,
    )
    expect(Number(counts.out)).toBe(stable.length + volatile.length)
  })
})
