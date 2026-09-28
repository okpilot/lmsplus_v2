/**
 * Red Team Spec: ordering item ids must be derived from their own text (Vector FX, #1045).
 *
 * Threat: `get_quiz_questions` delivers `ordering_items_shuffled` as {id,text} under
 * `ORDER BY random()`; the canonical order is the stored array order. An order-encoding id
 * ('1','2','3') or an id copied from another item lets a student sort the delivery by id and
 * recover the answer. Mig 20260928000100 makes `is_valid_ordering_items` (inside
 * questions_question_type_columns_check) require `id = ordering_item_id(text)`.
 *
 * Attacks (all expected 23514, row state unchanged):
 *  - FX1 service-role INSERT with order-encoding ids.
 *  - FX2 service-role INSERT with derived ids swapped between items.
 *  - FX3 service-role UPDATE of a valid row to order-encoding ids.
 *  - FX4 admin (authenticated role, the insert-question.ts path) INSERT with hand ids.
 *  - FX5 INSERT with whitespace-only text (NBSP + tab) carrying its own derived id.
 * Controls: derived-id INSERT succeeds as service role AND as the authenticated admin; the
 * student delivery carries ids equal to deriveContentId('o',[text]); anon cannot EXECUTE
 * ordering_item_id while an authenticated caller gets the JS-identical id.
 */

import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { deriveContentId } from '../../scripts/content-ids'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_FX_MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!ANON_KEY) {
  throw new Error('ordering-item-derived-ids.spec: NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
}

const MARKER_LIKE = `${E2E_REDTEAM_FX_MARKER.replace(/[\\%_]/g, '\\$&')}%`
const TEXTS = ['MAYDAY MAYDAY MAYDAY', 'Golf Bravo Charlie', 'engine failure', 'position']
const derived = (text: string) => ({ id: deriveContentId('o', [text]), text })
const DERIVED_ITEMS = TEXTS.map(derived)
const ORDER_ENCODED_ITEMS = TEXTS.map((text, i) => ({ id: String(i + 1), text }))
// Every id is a real derived id, but belongs to the NEXT item's text.
const SWAPPED_ITEMS = TEXTS.map((text, i) => ({
  id: deriveContentId('o', [TEXTS[(i + 1) % TEXTS.length] as string]),
  text,
}))
// Parity probe: final sigma, dotted capital I, BOM/NBSP/ideographic space/line separator.
const PARITY_TEXT = `${String.fromCodePoint(0xfeff)} ΟΔΟΣ ΣΑΣ İstanbul${String.fromCodePoint(0xa0, 0x3000)}x${String.fromCodePoint(0x2028)}y `

type OrderingItem = { id: string; text: string }

function toItems(value: unknown): OrderingItem[] {
  if (!Array.isArray(value)) throw new Error('ordering_items payload is not an array')
  return value.map((v) => {
    const { id, text } = (v ?? {}) as { id?: unknown; text?: unknown }
    if (typeof id !== 'string' || typeof text !== 'string') {
      throw new Error('ordering item lacks string id/text')
    }
    return { id, text }
  })
}

test.describe('Red Team: ordering item ids derived from text (Vector FX)', () => {
  let admin: SupabaseClient
  let studentClient: SupabaseClient
  let adminUserClient: SupabaseClient
  let base: Record<string, unknown>

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    const adminSeed = await seedRedTeamAdmin()
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminUserClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId: seed.orgId })
    const { data: fkRow, error: fkErr } = await admin
      .from('questions')
      .select('bank_id')
      .eq('organization_id', seed.orgId)
      .eq('subject_id', picked.subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fkErr) throw new Error(`FX beforeAll: bank lookup: ${fkErr.message}`)
    if (!fkRow) throw new Error('FX beforeAll: no active question to derive bank_id from')
    base = {
      organization_id: seed.orgId,
      bank_id: fkRow.bank_id,
      subject_id: picked.subjectId,
      topic_id: picked.topicId,
      created_by: adminSeed.adminUserId,
      question_text: `${E2E_REDTEAM_FX_MARKER} ordering fixture`,
      explanation_text: 'Red-team FX fixture explanation.',
      difficulty: 'medium',
      status: 'active',
      question_type: 'ordering',
      options: [],
      correct_option_id: null,
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
    }
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .like('question_number', MARKER_LIKE)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`FX afterEach soft-delete: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.log(`[FX] soft-deleted ${data?.length} question(s)`)
  })

  const row = (label: string, items: OrderingItem[]) => ({
    ...base,
    question_number: `${E2E_REDTEAM_FX_MARKER} ${label} ${Date.now()}`,
    ordering_items: items,
  })

  async function countMarkerRows(label: string): Promise<number> {
    const { count, error } = await admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .like('question_number', `${MARKER_LIKE.slice(0, -1)} ${label}%`)
      .is('deleted_at', null)
    if (error) throw new Error(`count ${label}: ${error.message}`)
    return count ?? 0
  }

  async function insertDerived(label: string): Promise<string> {
    const { data, error } = await admin
      .from('questions')
      .insert(row(label, DERIVED_ITEMS))
      .select('id')
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error(`insertDerived(${label}) returned no row`)
    return data.id as string
  }

  test('control: a student receives ids that are exactly the hash of the visible text', async () => {
    const questionId = await insertDerived('delivery-control')
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: [questionId],
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as { id: string; ordering_items_shuffled: unknown }[]
    expect(rows).toHaveLength(1)
    const delivered = toItems(rows[0]?.ordering_items_shuffled)
    expect(delivered).toHaveLength(TEXTS.length)
    expect(delivered.map((i) => i.text).sort()).toEqual([...TEXTS].sort())
    for (const item of delivered) {
      expect(item.id).toBe(deriveContentId('o', [item.text]))
    }
  })

  test('FX1: order-encoding ids are rejected at INSERT', async () => {
    const { error } = await admin.from('questions').insert(row('fx1', ORDER_ENCODED_ITEMS))
    expect(error?.code).toBe('23514')
    expect(await countMarkerRows('fx1')).toBe(0)
  })

  test('FX2: derived ids swapped between items are rejected at INSERT', async () => {
    // Non-vacuity: the same ids in their own slots are accepted.
    await insertDerived('fx2-control')
    const { error } = await admin.from('questions').insert(row('fx2-swapped', SWAPPED_ITEMS))
    expect(error?.code).toBe('23514')
    expect(await countMarkerRows('fx2-swapped')).toBe(0)
  })

  test('FX3: rewriting a valid row to order-encoding ids is rejected and leaves it unchanged', async () => {
    const questionId = await insertDerived('fx3')
    const { data: before, error: beforeErr } = await admin
      .from('questions')
      .select('ordering_items')
      .eq('id', questionId)
      .single()
    expect(beforeErr).toBeNull()
    expect(toItems(before?.ordering_items)).toEqual(DERIVED_ITEMS)

    const { error } = await admin
      .from('questions')
      .update({ ordering_items: ORDER_ENCODED_ITEMS })
      .eq('id', questionId)
    expect(error?.code).toBe('23514')

    const { data: after, error: afterErr } = await admin
      .from('questions')
      .select('ordering_items')
      .eq('id', questionId)
      .single()
    expect(afterErr).toBeNull()
    expect(toItems(after?.ordering_items)).toEqual(DERIVED_ITEMS)
  })

  test('FX4: an authenticated admin cannot author hand ids but can author derived ids', async () => {
    const { error: handErr } = await adminUserClient
      .from('questions')
      .insert(row('fx4-hand', ORDER_ENCODED_ITEMS))
    expect(handErr?.code).toBe('23514')
    expect(await countMarkerRows('fx4-hand')).toBe(0)

    // Control: the CHECK's ordering_item_id() call runs as `authenticated` and succeeds.
    const { data, error } = await adminUserClient
      .from('questions')
      .insert(row('fx4-derived', DERIVED_ITEMS))
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(typeof data?.id).toBe('string')
  })

  test('FX5: whitespace-only item text is rejected even with its own derived id', async () => {
    const blank = `${String.fromCodePoint(0xa0)}\t`
    const items = [...DERIVED_ITEMS.slice(0, 2), derived(blank)]
    const { error } = await admin.from('questions').insert(row('fx5-blank', items))
    expect(error?.code).toBe('23514')
    expect(await countMarkerRows('fx5-blank')).toBe(0)
  })

  test('ordering_item_id: anon is denied, authenticated gets the JS-identical id', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: anonErr } = await anon.rpc('ordering_item_id', { p_text: PARITY_TEXT })
    expect(anonErr?.code).toBe('42501')

    const { data, error } = await studentClient.rpc('ordering_item_id', { p_text: PARITY_TEXT })
    expect(error).toBeNull()
    expect(data).toBe(deriveContentId('o', [PARITY_TEXT]))
  })
})
