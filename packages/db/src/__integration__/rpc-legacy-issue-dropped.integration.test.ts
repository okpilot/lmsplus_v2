import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { getAdminClient } from './setup'

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
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

/** PR 2e: the legacy per-student issue RPC is dropped. */
describe('RPC: issue_internal_exam_code is dropped', () => {
  it('has no pg_proc row', () => {
    const { out, err } = psql(
      "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'issue_internal_exam_code';",
    )
    expect(err).toBe('')
    expect(Number(out)).toBe(0)
  })

  it('is not callable through PostgREST', async () => {
    const r = await getAdminClient().rpc('issue_internal_exam_code', {
      p_subject_id: '00000000-0000-4000-a000-000000000001',
      p_student_id: '00000000-0000-4000-a000-000000000002',
    })
    expect(r.error).not.toBeNull()
    expect(r.error?.code).toBe('PGRST202')
  })
})
