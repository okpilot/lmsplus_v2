/**
 * Red Team Spec: bypassing the is_valid_diagram_config derived-id rule (Vector LB, #1215).
 *
 * Threat: mig 20261106000100 is the only DB guard keeping pairing information out of delivered
 * diagram ids. Each attack below is one edit away from a config the CHECK accepts, chosen so the
 * id regains an author-controlled sort order or the validator aborts/returns UNKNOWN.
 *
 * Expected for every attack: 23514 (a total validator: never 22023/22P02), no row stored.
 * Controls: the unedited config is stored, and it is delivered with shuffled labels and with zones
 * in stored order; an ordering row without the smuggled diagram_config is stored.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveContentId } from '../../scripts/content-ids'
import { deriveLabelId, deriveZoneId } from '../../scripts/diagram-content'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_LB_MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const MARKER_LIKE = `${E2E_REDTEAM_LB_MARKER.replace(/[\\%_]/g, '\\$&')}%`
const REF = 'rwy-27-09-lh-pattern'
const INDICES = [0, 2, 4]
const TEXTS = ['Upwind Leg', 'Crosswind Leg', 'Downwind Leg', 'Base Leg (unused)']
const DELIVERIES = 12

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type Config = {
  image_ref: string
  zones: Zone[]
  labels: Label[]
  answer: Array<{ zone_id: string; label_id: string }>
}

function validConfig(): Config {
  const zones = INDICES.map((j, i) => ({
    id: deriveZoneId(REF, j),
    x: 0.1 + 0.2 * i,
    y: 0.1,
    w: 0.1,
    h: 0.1,
  }))
  const labels = TEXTS.map((text) => ({ id: deriveLabelId(text), text }))
  const answer = zones.map((z, i) => ({ zone_id: z.id, label_id: (labels[i] as Label).id }))
  return { image_ref: REF, zones, labels, answer }
}

/** Replace one id everywhere it appears, so the answer stays referentially valid. */
function renamed(config: Config, from: string, to: string): Config {
  const swap = (id: string) => (id === from ? to : id)
  return {
    ...config,
    zones: config.zones.map((z) => ({ ...z, id: swap(z.id) })),
    labels: config.labels.map((l) => ({ ...l, id: swap(l.id) })),
    answer: config.answer.map((a) => ({ zone_id: swap(a.zone_id), label_id: swap(a.label_id) })),
  }
}

function swappedLabelIds(): Config {
  const c = validConfig()
  const [a, b] = c.labels as [Label, Label]
  const t = '__swap__'
  return renamed(renamed(renamed(c, a.id, t), b.id, a.id), t, b.id)
}

function withLabel(label: unknown): unknown {
  const c = validConfig()
  return { ...c, labels: [...c.labels, label] }
}

const first = validConfig()
const firstZoneId = (first.zones[0] as Zone).id
const lastZoneId = (first.zones[2] as Zone).id
const firstLabelId = (first.labels[0] as Label).id

const ATTACKS: Array<[string, unknown]> = [
  ['zones-descending', { ...first, zones: [...first.zones].reverse() }],
  ['zone-foreign-image-ref', renamed(first, firstZoneId, deriveZoneId('other-ref', 0))],
  ['zone-index-past-max', renamed(first, lastZoneId, deriveZoneId(REF, 50))],
  ['zone-id-uppercase', renamed(first, firstZoneId, firstZoneId.toUpperCase())],
  ['label-ids-swapped', swappedLabelIds()],
  ['label-id-ordering-prefix', renamed(first, firstLabelId, `o1${firstLabelId.slice(2)}`)],
  ['label-id-uppercase', renamed(first, firstLabelId, firstLabelId.toUpperCase())],
  ['label-extra-key', withLabel({ id: deriveLabelId('Go-around'), text: 'Go-around', order: 0 })],
  ['label-whitespace-text', withLabel({ id: deriveLabelId('　\t'), text: '　\t' })],
  ['label-number-text', withLabel({ id: deriveLabelId('1'), text: 1 })],
  ['image-ref-whitespace', { ...first, image_ref: '　' }],
  ['image-ref-object', { ...first, image_ref: {} }],
  ['zones-scalars', { ...first, zones: [1, 'x', null] }],
  ['zones-object', { ...first, zones: {} }],
  ['labels-scalars', { ...first, labels: ['x'] }],
  ['answer-nulls', { ...first, answer: [null, null, null] }],
  ['config-array', [first]],
  ['config-scalar', 'x'],
]

test.describe('Red Team: is_valid_diagram_config derived-id bypass (Vector LB)', () => {
  let admin: SupabaseClient
  let student: SupabaseClient
  let base: Record<string, unknown>

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    const adminSeed = await seedRedTeamAdmin()
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId: seed.orgId })
    const { data, error } = await admin
      .from('questions')
      .select('bank_id')
      .eq('organization_id', seed.orgId)
      .eq('subject_id', picked.subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`LB beforeAll: bank lookup: ${error.message}`)
    if (!data) throw new Error('LB beforeAll: no active question to derive bank_id from')
    base = {
      organization_id: seed.orgId,
      bank_id: data.bank_id,
      subject_id: picked.subjectId,
      topic_id: picked.topicId,
      created_by: adminSeed.adminUserId,
      question_text: `${E2E_REDTEAM_LB_MARKER} fixture`,
      explanation_text: 'Red-team LB fixture explanation.',
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
    if (error) throw new Error(`LB afterEach soft-delete: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.log(`[LB] soft-deleted ${data?.length} question(s)`)
  })

  const row = (label: string, type: string, columns: Record<string, unknown>) => ({
    ...base,
    question_number: `${E2E_REDTEAM_LB_MARKER} ${label} ${Date.now()}`,
    question_type: type,
    ...columns,
  })

  async function liveCount(label: string): Promise<number> {
    const { count, error } = await admin
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .like('question_number', `${MARKER_LIKE.slice(0, -1)} ${label} %`)
      .is('deleted_at', null)
    if (error) throw new Error(`count ${label}: ${error.message}`)
    return count ?? 0
  }

  for (const [label, config] of ATTACKS) {
    test(`LB: ${label} is rejected by the CHECK and stores nothing`, async () => {
      const { error } = await admin
        .from('questions')
        .insert(row(label, 'diagram_label', { diagram_config: config }))
      expect(error?.code).toBe('23514')
      expect(await liveCount(label)).toBe(0)
    })
  }

  test('LB: a diagram_config cannot ride on a non-diagram question', async () => {
    const items = ['first', 'second'].map((text) => ({ id: deriveContentId('o', [text]), text }))
    const { error } = await admin
      .from('questions')
      .insert(row('smuggled', 'ordering', { ordering_items: items, diagram_config: first }))
    expect(error?.code).toBe('23514')
    expect(await liveCount('smuggled')).toBe(0)

    // CONTROL: the same row without the smuggled config is stored.
    const { error: cleanErr } = await admin
      .from('questions')
      .insert(row('unsmuggled', 'ordering', { ordering_items: items }))
    expect(cleanErr).toBeNull()
    expect(await liveCount('unsmuggled')).toBe(1)
  })

  test('LB control: the unedited config is stored and delivered shuffled, zones in order', async () => {
    const { data, error } = await admin
      .from('questions')
      .insert(row('valid', 'diagram_label', { diagram_config: first }))
      .select('id')
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error('LB control insert returned no row')

    const orders = new Set<string>()
    for (let i = 0; i < DELIVERIES; i++) {
      const { data: rows, error: rpcErr } = await student.rpc('get_quiz_questions', {
        p_question_ids: [data.id],
      })
      expect(rpcErr).toBeNull()
      expect(rows).toHaveLength(1)
      const pub = (rows as Array<{ diagram_config_public: Record<string, unknown> }>)[0]
        ?.diagram_config_public as { zones: Zone[]; labels: Label[] }
      expect(Object.keys(pub).sort()).toEqual(['image_ref', 'labels', 'zones'])
      expect(pub.zones.map((z) => z.id)).toEqual(first.zones.map((z) => z.id))
      expect(pub.labels.map((l) => l.id).sort()).toEqual(first.labels.map((l) => l.id).sort())
      orders.add(pub.labels.map((l) => l.id).join())
    }
    expect(orders.size).toBeGreaterThan(1)
  })
})
