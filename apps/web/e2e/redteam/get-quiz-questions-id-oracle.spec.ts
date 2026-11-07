/**
 * Red Team Spec: id-sort answer oracle on get_quiz_questions (Vector EY, #1215).
 *
 * Threat: `get_quiz_questions` delivers diagram zones in stored order and labels shuffled. If
 * label ids encode the canonical pairing, `labels.sort(byId)` zipped against the zones recovers
 * every zone -> label pair; the same holds for `ordering_items_shuffled`. Mig 20261106000100
 * makes `is_valid_diagram_config` require label id = f(text) and zone id = f(image_ref, index);
 * mig 20260928000100 does the same for ordering (EY2).
 *
 * Attacks (EY1a-c expected 23514, row state unchanged):
 *  - EY1a service-role INSERT with sortable label ids.
 *  - EY1b authenticated admin INSERT with hand ids.
 *  - EY1c service-role UPDATE of a valid row to sortable ids.
 *  - EY1d delivery to a student: ids equal the derivation and the sort-and-zip oracle does NOT
 *    reproduce the canonical pairing.
 *  - EY2 same delivery check for an ordering question.
 * Non-vacuity: the same oracle function reconstructs the pairing on a position-encoded config
 * (pure JS; the CHECK forbids storing one). Controls: derived INSERT succeeds as service role
 * and as admin.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveContentId } from '../../scripts/content-ids'
import { deriveLabelId, deriveZoneId } from '../../scripts/diagram-content'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_EY_MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const MARKER_LIKE = `${E2E_REDTEAM_EY_MARKER.replace(/[\\%_]/g, '\\$&')}%`
const IMAGE_REF = 'rwy-27-09-lh-pattern'

// Canonical pairing: zone i <-> LABEL_TEXTS[i]; the last label is an unused distractor. With
// these texts the derived-id sort order differs from the canonical order (asserted below).
const LABEL_TEXTS = ['Upwind Leg', 'Crosswind Leg', 'Downwind Leg', 'Base Leg (unused)']
const ZONE_GEOMETRY = [
  { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  { x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
  { x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
]
const ORDER_TEXTS = ['MAYDAY MAYDAY MAYDAY', 'Golf Bravo Charlie', 'engine failure', 'position']

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type Pair = { zone_id: string; label_id: string }
type Config = { image_ref: string; zones: Zone[]; labels: Label[]; answer: Pair[] }

function buildConfig(zoneId: (i: number) => string, labelId: (text: string, i: number) => string) {
  const zones = ZONE_GEOMETRY.map((g, i) => ({ id: zoneId(i), ...g }))
  const labels = LABEL_TEXTS.map((text, i) => ({ id: labelId(text, i), text }))
  const answer = zones.map((z, i) => ({ zone_id: z.id, label_id: (labels[i] as Label).id }))
  return { image_ref: IMAGE_REF, zones, labels, answer } satisfies Config
}

const DERIVED = buildConfig(
  (i) => deriveZoneId(IMAGE_REF, i),
  (text) => deriveLabelId(text),
)
// The attack: label ids ascend with canonical position, so sorting by id recovers the key.
const SORTABLE = buildConfig(
  (i) => deriveZoneId(IMAGE_REF, i),
  (_text, i) => `l1-${String(i).padStart(2, '0')}`,
)
const HAND = buildConfig(
  (i) => `zone-${i}`,
  (_text, i) => `lbl-${i}`,
)

/** The attacker's oracle: sort the delivered labels by id, zip index-wise against the zones. */
function oracleDiagramPairs(zones: Zone[], labels: Label[]): Array<[string, string]> {
  const sorted = [...labels].sort((a, b) => (a.id < b.id ? -1 : 1))
  return zones.map((z, i) => [z.id, (sorted[i] as Label).text])
}
const canonicalDiagramPairs = (zones: Zone[]): Array<[string, string]> =>
  zones.map((z, i) => [z.id, LABEL_TEXTS[i] as string])

/** Same oracle for ordering: sort the delivered items by id. */
const oracleOrder = (items: Array<{ id: string; text: string }>) =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : 1)).map((i) => i.text)

const ORDER_DERIVED = ORDER_TEXTS.map((text) => ({ id: deriveContentId('o', [text]), text }))
const ORDER_SORTABLE = ORDER_TEXTS.map((text, i) => ({ id: `o1-${i}`, text }))

function asRecords(value: unknown, what: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error(`${what} is not an array`)
  return value as Array<Record<string, unknown>>
}

test.describe('Red Team: get_quiz_questions id-sort oracle (Vector EY)', () => {
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
    if (fkErr) throw new Error(`EY beforeAll: bank lookup: ${fkErr.message}`)
    if (!fkRow) throw new Error('EY beforeAll: no active question to derive bank_id from')
    base = {
      organization_id: seed.orgId,
      bank_id: fkRow.bank_id,
      subject_id: picked.subjectId,
      topic_id: picked.topicId,
      created_by: adminSeed.adminUserId,
      explanation_text: 'Red-team EY fixture explanation.',
      difficulty: 'medium',
      status: 'active',
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
    if (error) throw new Error(`EY afterEach soft-delete: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.log(`[EY] soft-deleted ${data?.length} question(s)`)
  })

  const diagramRow = (label: string, config: unknown) => ({
    ...base,
    question_number: `${E2E_REDTEAM_EY_MARKER} ${label} ${Date.now()}`,
    question_text: `${E2E_REDTEAM_EY_MARKER} diagram fixture`,
    question_type: 'diagram_label',
    diagram_config: config,
  })
  const orderingRow = (label: string, items: unknown) => ({
    ...base,
    question_number: `${E2E_REDTEAM_EY_MARKER} ${label} ${Date.now()}`,
    question_text: `${E2E_REDTEAM_EY_MARKER} ordering fixture`,
    question_type: 'ordering',
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

  async function insertDerivedDiagram(label: string): Promise<string> {
    const { data, error } = await admin
      .from('questions')
      .insert(diagramRow(label, DERIVED))
      .select('id')
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error(`insertDerivedDiagram(${label}) returned no row`)
    return data.id as string
  }

  async function deliver(questionId: string) {
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: [questionId],
    })
    expect(error).toBeNull()
    const rows = asRecords(data, 'get_quiz_questions result')
    expect(rows).toHaveLength(1)
    return rows[0] as Record<string, unknown>
  }

  test('non-vacuity: the oracle recovers the pairing from position-encoded ids', () => {
    // Pure JS: the CHECK forbids storing such a row, so the attack is shown on the shape only.
    expect(oracleDiagramPairs(SORTABLE.zones, SORTABLE.labels)).toEqual(
      canonicalDiagramPairs(SORTABLE.zones),
    )
    expect(oracleOrder(ORDER_SORTABLE)).toEqual(ORDER_TEXTS)
  })

  test('EY1a: service-role INSERT with sortable label ids is rejected', async () => {
    const { error } = await admin.from('questions').insert(diagramRow('ey1a', SORTABLE))
    expect(error?.code).toBe('23514')
    expect(await countMarkerRows('ey1a')).toBe(0)
  })

  test('EY1b: an authenticated admin cannot author hand ids but can author derived ids', async () => {
    const { error: handErr } = await adminUserClient
      .from('questions')
      .insert(diagramRow('ey1b-hand', HAND))
    expect(handErr?.code).toBe('23514')
    expect(await countMarkerRows('ey1b-hand')).toBe(0)

    // Control: the CHECK's ordering_item_id() call runs as `authenticated` and succeeds.
    const { data, error } = await adminUserClient
      .from('questions')
      .insert(diagramRow('ey1b-derived', DERIVED))
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(typeof data?.id).toBe('string')
  })

  test('EY1c: rewriting a valid row to sortable ids is rejected and leaves it unchanged', async () => {
    const questionId = await insertDerivedDiagram('ey1c')
    const { error } = await admin
      .from('questions')
      .update({ diagram_config: SORTABLE })
      .eq('id', questionId)
    expect(error?.code).toBe('23514')

    const { data: after, error: afterErr } = await admin
      .from('questions')
      .select('diagram_config')
      .eq('id', questionId)
      .single()
    expect(afterErr).toBeNull()
    expect(after?.diagram_config).toEqual(DERIVED)
  })

  test('EY1d: delivered diagram ids are derived and the id-sort oracle fails', async () => {
    const questionId = await insertDerivedDiagram('ey1d')
    const row = await deliver(questionId)
    const config = row.diagram_config_public as { zones: Zone[]; labels: Label[] }
    const zones = config.zones
    const labels = config.labels
    expect(zones.map((z) => z.id)).toEqual(DERIVED.zones.map((z) => z.id))
    expect(labels).toHaveLength(LABEL_TEXTS.length)
    for (const l of labels) expect(l.id).toBe(deriveLabelId(l.text))

    // Non-vacuity: the delivery carries a full canonical pairing the oracle could have matched.
    const canonical = canonicalDiagramPairs(zones)
    expect(canonical).toHaveLength(ZONE_GEOMETRY.length)
    expect(oracleDiagramPairs(zones, labels)).not.toEqual(canonical)
  })

  test('EY2: ordering delivery ids are derived and the id-sort oracle fails', async () => {
    // Control: derived ids are accepted.
    const { data, error } = await admin
      .from('questions')
      .insert(orderingRow('ey2', ORDER_DERIVED))
      .select('id')
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error('EY2 insert returned no row')

    const { error: sortableErr } = await admin
      .from('questions')
      .insert(orderingRow('ey2-sortable', ORDER_SORTABLE))
    expect(sortableErr?.code).toBe('23514')
    expect(await countMarkerRows('ey2-sortable')).toBe(0)

    const row = await deliver(data.id as string)
    const items = asRecords(row.ordering_items_shuffled, 'ordering_items_shuffled') as Array<{
      id: string
      text: string
    }>
    expect(items).toHaveLength(ORDER_TEXTS.length)
    for (const item of items) expect(item.id).toBe(deriveContentId('o', [item.text]))
    expect(oracleOrder(items)).not.toEqual(ORDER_TEXTS)
  })
})
