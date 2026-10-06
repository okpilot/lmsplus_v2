import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { orderingItem } from './ordering-item-id'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// The _grade_record_* helpers (mc, short_answer, dialog_fill, ordering, diagram_label) are
// internal per-answer grade+record helpers — REVOKE EXECUTE ... FROM PUBLIC, anon,
// authenticated (`CREATE FUNCTION` grants EXECUTE to PUBLIC by default AND Supabase
// separately grants anon/authenticated via ALTER DEFAULT PRIVILEGES, so REVOKE FROM PUBLIC
// alone is insufficient — every API role must be named).
// The helpers trust their p_student_id/p_session_id/p_org_id args with no auth.uid() check
// of their own — they are reached only through _grade_session_progress (finish_quiz_session,
// complete_overdue_exam_session), which owns the authorization. This REVOKE only takes
// effect at EXECUTION via PostgREST — a `db reset` proves only that the REVOKE statement
// parsed, not that the grant table was actually updated.

const DUMMY_ID = '00000000-0000-0000-0000-000000000000'
const ORDERING_ITEMS = [orderingItem('MAYDAY MAYDAY MAYDAY'), orderingItem('callsign Golf Bravo')]
const DIAGRAM_CONFIG = {
  image_ref: 'rwy-27-09-lh-pattern',
  zones: [{ id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
  labels: [{ id: 'lbl-alpha', text: 'Upwind Leg' }],
  answer: [{ zone_id: 'zone-nw', label_id: 'lbl-alpha' }],
}

type Ids = { studentId: string; orgId: string }

const HELPERS: Array<{ fn: string; args: (ids: Ids) => Record<string, unknown> }> = [
  {
    fn: '_grade_record_mc',
    args: ({ studentId, orgId }) => ({
      p_session_id: DUMMY_ID,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: DUMMY_ID,
      p_selected: 'a',
      p_correct_option: 'a',
      p_options: [],
      p_response_time: 0,
    }),
  },
  {
    fn: '_grade_record_short_answer',
    args: ({ studentId, orgId }) => ({
      p_session_id: DUMMY_ID,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: DUMMY_ID,
      p_response_text: 'x',
      p_canonical: 'x',
      p_synonyms: [],
      p_response_time: 0,
    }),
  },
  {
    fn: '_grade_record_dialog_fill',
    args: ({ studentId, orgId }) => ({
      p_session_id: DUMMY_ID,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: DUMMY_ID,
      p_blank_index: 0,
      p_response_text: 'x',
      p_blanks_config: [],
      p_response_time: 0,
    }),
  },
  {
    fn: '_grade_record_ordering',
    args: ({ studentId, orgId }) => ({
      p_session_id: DUMMY_ID,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: DUMMY_ID,
      p_slot: 0,
      p_item_id: ORDERING_ITEMS[0]?.id,
      p_ordering_items: ORDERING_ITEMS,
      p_response_time: 0,
    }),
  },
  {
    fn: '_grade_record_diagram_label',
    args: ({ studentId, orgId }) => ({
      p_session_id: DUMMY_ID,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: DUMMY_ID,
      p_zone_id: 'zone-nw',
      p_label_id: 'lbl-alpha',
      p_diagram_config: DIAGRAM_CONFIG,
      p_response_time: 0,
    }),
  },
]

function isDenied(error: { code?: string; message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase()
  return (
    error?.code === '42501' ||
    error?.code === 'PGRST202' ||
    message.includes('permission denied') ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  )
}

describe('RPC: _grade_record_* helpers — REVOKE FROM PUBLIC/anon/authenticated', () => {
  const admin = getAdminClient()
  let orgId = ''
  let studentId = ''
  let studentClient: SupabaseClient
  const userIds: string[] = []
  const suffix = fixtureSuffix()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org GradeRecordRevoke ${suffix}`,
      slug: `test-graderecordrevoke-${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-graderecordrevoke-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-graderecordrevoke-${suffix}@test.local`,
      password: 'test-pass-123',
    })
  })

  afterAll(async () => {
    if (orgId) await cleanupTestData({ admin, orgId, userIds })
  })

  // Positive control (§7 non-vacuity): the admin (service-role) call must resolve the
  // signature — it may fail later (FK violation on the dummy ids), but NOT with PGRST202 —
  // so a PGRST202 in a denial check genuinely means REVOKE, not an argument-shape drift.
  async function expectHelperSignatureResolves(fn: string, payload: Record<string, unknown>) {
    const { error } = await admin.rpc(fn, payload)
    expect(error?.code, `${fn} signature must resolve: ${error?.message}`).not.toBe('PGRST202')
  }

  // Payloads are SIGNATURE-VALID (not `{}`): with a wrong arg shape PostgREST returns
  // PGRST202 from overload resolution BEFORE the EXECUTE permission check, so the
  // assertion would pass vacuously even if the REVOKE regressed (code-style.md §7).
  it.each(HELPERS)(
    'prevents an authenticated caller from executing $fn directly',
    async ({ fn, args }) => {
      const payload = args({ studentId, orgId })
      await expectHelperSignatureResolves(fn, payload)
      const { error } = await studentClient.rpc(fn, payload)
      expect(error, `${fn} must be uncallable by authenticated`).not.toBeNull()
      expect(isDenied(error), `${fn} error was ${error?.code}: ${error?.message}`).toBe(true)
    },
  )

  // The authenticated case only proves the `authenticated` grant is gone; without an anon
  // case an anon-only grant leak would ship unnoticed.
  it.each(HELPERS)(
    'prevents an anonymous caller from executing $fn directly',
    async ({ fn, args }) => {
      const payload = args({ studentId, orgId })
      await expectHelperSignatureResolves(fn, payload)
      const { error } = await getAnonClient().rpc(fn, payload)
      expect(error, `${fn} must be uncallable by anon`).not.toBeNull()
      expect(isDenied(error), `anon ${fn} error was ${error?.code}: ${error?.message}`).toBe(true)
    },
  )
})
