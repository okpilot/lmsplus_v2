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
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

/** AC-7: private time helpers (psql). */
describe('private sitting time helpers', () => {
  const ts = (expr: string) =>
    `SELECT to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US');`

  it('AC-7: sitting_day_end is the next UTC midnight for 09:00, 00:00 and 23:59:59.999999', () => {
    for (const t of ['2026-11-17 09:00Z', '2026-11-17 00:00Z', '2026-11-17 23:59:59.999999Z']) {
      const r = psql(ts(`private.sitting_day_end('${t}'::timestamptz)`))
      expect(r.err, t).toBe('')
      expect(r.out, t).toBe('2026-11-18 00:00:00.000000')
    }
  })

  it('AC-7: sitting_code_expiry is day end minus one microsecond', () => {
    const r = psql(ts("private.sitting_code_expiry('2026-11-17 09:00Z'::timestamptz)"))
    expect(r.err).toBe('')
    expect(r.out).toBe('2026-11-17 23:59:59.999999')
  })

  it('AC-7: results are identical under Pacific/Auckland', () => {
    const r = psql(
      `SET TIME ZONE 'Pacific/Auckland'; ${ts("private.sitting_day_end('2026-11-17 09:00Z'::timestamptz)")} ${ts("private.sitting_code_expiry('2026-11-17 09:00Z'::timestamptz)")}`,
    )
    expect(r.err).toBe('')
    expect(r.out.split('\n').slice(-2)).toEqual([
      '2026-11-18 00:00:00.000000',
      '2026-11-17 23:59:59.999999',
    ])
  })

  it('AC-7: sitting_day_ended is false at today 00:00 UTC and true one microsecond earlier', () => {
    const r = psql(
      "SELECT private.sitting_day_ended(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'); SELECT private.sitting_day_ended((date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 microsecond');",
    )
    expect(r.err).toBe('')
    expect(r.out.split('\n')).toEqual(['f', 't'])
  })
})
