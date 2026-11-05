/**
 * Red Team Spec: get_admin_dashboard_kpis + get_admin_weak_topics RPCs (Vector KX, #1251)
 *
 * SECURITY DEFINER admin-dashboard aggregates (migs 20260406000001 / 20260406000002, never
 * redefined). Guards in order: `not authenticated` (auth.uid() NULL), `forbidden` (NOT is_admin(),
 * which is `role = 'admin' AND deleted_at IS NULL`), `user not found` (active-user org re-select).
 * GRANT EXECUTE is to `authenticated` only; anon EXECUTE is revoked on every public function by
 * mig 20260925000400.
 *
 * Per RPC:
 *  - anon → 42501 `permission denied for function` (privilege layer, before the body runs);
 *  - live student → `forbidden`;
 *  - soft-deleted admin holding a still-valid JWT → `forbidden` (dedicated throwaway admin,
 *    left soft-deleted afterwards, revived by beforeAll; the same token returned data before the
 *    soft-delete).
 * Every denial returns null data, so no org aggregate leaks.
 *
 * CONTROL: the egmont admin gets all six KPI keys with totalStudents >= 1, and >= 1 weak-topic row
 * carrying all six columns (the victim's seeded responses guarantee rows).
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { expectLiveStudent } from './helpers/attacker-pin'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KX_SOFTDEL_ADMIN_EMAIL,
  E2E_REDTEAM_KX_SOFTDEL_ADMIN_PASSWORD,
} from './helpers/seed-markers'
import { seedVictimResponses } from './helpers/seed-responses'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const KPIS = 'get_admin_dashboard_kpis'
const WEAK = 'get_admin_weak_topics'
const KPI_KEYS = [
  'activeStudents',
  'avgMastery',
  'examReadyStudents',
  'sessionsThisPeriod',
  'totalStudents',
  'weakestSubject',
]
const WEAK_COLUMNS = [
  'avg_score',
  'student_count',
  'subject_name',
  'subject_short',
  'topic_id',
  'topic_name',
]
const kpiArgs = { p_range_days: 30 }
const weakArgs = { p_limit: 10 }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isPercent = (v: unknown): boolean => isCount(v) && (v as number) <= 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test.describe('Red Team: admin dashboard KPI + weak-topics RPCs (KX)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let adminClient: Client
  let studentClient: Client
  let softDelAdminId: string
  let softDelAdminClient: Client

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    await seedVictimResponses()
    await seedRedTeamAdmin()
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    await expectLiveStudent(admin, ATTACKER_EMAIL)

    // Dedicated throwaway admin: soft-deleting the shared admin would cascade into other specs.
    softDelAdminId = await upsertUser(
      admin,
      E2E_REDTEAM_KX_SOFTDEL_ADMIN_EMAIL,
      E2E_REDTEAM_KX_SOFTDEL_ADMIN_PASSWORD,
      await getEgmontOrgId(admin),
      'admin',
    )
    // Revive the row the previous run left soft-deleted.
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: null })
      .eq('id', softDelAdminId)
      .select('id')
    if (error) throw new Error(`beforeAll revive throwaway admin: ${error.message}`)
    if (!data?.length) throw new Error('beforeAll revive throwaway admin: no row updated')
    // Sign in BEFORE any soft-delete: this JWT stays valid for the post-delete calls.
    softDelAdminClient = await createAuthenticatedClient(
      E2E_REDTEAM_KX_SOFTDEL_ADMIN_EMAIL,
      E2E_REDTEAM_KX_SOFTDEL_ADMIN_PASSWORD,
    )
  })

  test.afterAll(async () => {
    if (!softDelAdminId) return
    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDelAdminId)
    if (error) throw new Error(`afterAll soft-delete throwaway admin: ${error.message}`)
  })

  test('KX control: the egmont admin gets the full KPI payload and weak-topic rows', async () => {
    const kpis = await adminClient.rpc(KPIS, kpiArgs)
    expect(kpis.error).toBeNull()
    expect(isRecord(kpis.data)).toBe(true)
    expect(Object.keys(kpis.data as object).sort()).toEqual(KPI_KEYS)
    const k = kpis.data as Record<string, unknown>
    for (const key of [
      'activeStudents',
      'examReadyStudents',
      'sessionsThisPeriod',
      'totalStudents',
    ]) {
      expect(isCount(k[key]), key).toBe(true)
    }
    expect(Number(k.totalStudents)).toBeGreaterThanOrEqual(1)
    expect(Number(k.activeStudents)).toBeLessThanOrEqual(Number(k.totalStudents))
    expect(Number(k.examReadyStudents)).toBeLessThanOrEqual(Number(k.totalStudents))
    expect(isPercent(k.avgMastery), 'avgMastery').toBe(true)
    const ws = k.weakestSubject
    if (ws !== null) {
      expect(isRecord(ws) && Object.keys(ws).sort()).toEqual(['avgMastery', 'name', 'short'])
      const w = ws as Record<string, unknown>
      expect(typeof w.name).toBe('string')
      expect(typeof w.short).toBe('string')
      expect(isPercent(w.avgMastery), 'weakestSubject.avgMastery').toBe(true)
    }

    const weak = await adminClient.rpc(WEAK, weakArgs)
    expect(weak.error).toBeNull()
    const rows = (weak.data ?? []) as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(WEAK_COLUMNS)
      expect(row.topic_id).toMatch(UUID_RE)
      for (const col of ['topic_name', 'subject_name', 'subject_short']) {
        expect(typeof row[col], col).toBe('string')
      }
      expect(isPercent(row.avg_score), 'avg_score').toBe(true)
      expect(isCount(row.student_count) && Number(row.student_count) >= 1, 'student_count').toBe(
        true,
      )
    }
  })

  test('KX: an unauthenticated caller is rejected at the privilege layer', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    for (const [fn, args] of [
      [KPIS, kpiArgs],
      [WEAK, weakArgs],
    ] as const) {
      const { data, error } = await anon.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
      expect(error?.message ?? '', fn).toMatch(/permission denied for function/i)
      expect(data, fn).toBeNull()
    }
  })

  test('KX: a live student is forbidden', async () => {
    for (const [fn, args] of [
      [KPIS, kpiArgs],
      [WEAK, weakArgs],
    ] as const) {
      const { data, error } = await studentClient.rpc(fn, args)
      expect(error?.message ?? '', fn).toMatch(/forbidden/i)
      expect(data, fn).toBeNull()
    }
  })

  test('KX: a soft-deleted admin with a still-valid JWT is forbidden', async () => {
    // Pre-delete: the same token passes the admin gate on both RPCs.
    const preKpis = await softDelAdminClient.rpc(KPIS, kpiArgs)
    expect(preKpis.error).toBeNull()
    expect(isRecord(preKpis.data)).toBe(true)
    const preWeak = await softDelAdminClient.rpc(WEAK, weakArgs)
    expect(preWeak.error).toBeNull()
    expect(((preWeak.data ?? []) as unknown[]).length).toBeGreaterThanOrEqual(1)

    let finalDeleteError: string | null = null
    let post: Array<{ fn: string; data: unknown; message: string }> = []
    try {
      const { data: del, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', softDelAdminId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      expect(del?.length).toBe(1)
      for (const [fn, args] of [
        [KPIS, kpiArgs],
        [WEAK, weakArgs],
      ] as const) {
        const r = await softDelAdminClient.rpc(fn, args)
        post = [...post, { fn, data: r.data, message: r.error?.message ?? '' }]
      }
    } finally {
      const { data, error } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', softDelAdminId)
        .select('id')
      if (error) finalDeleteError = error.message
      else if (!data?.length) finalDeleteError = 'soft-delete matched no rows'
    }
    expect(post.length).toBe(2)
    for (const r of post) {
      expect(r.message, r.fn).toMatch(/forbidden/i)
      expect(r.data, r.fn).toBeNull()
    }
    expect(finalDeleteError).toBeNull()
  })
})
