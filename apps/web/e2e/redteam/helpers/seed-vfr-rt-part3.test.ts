import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { deriveContentId } from '../../../scripts/content-ids'
import {
  buildPart3Rows,
  seedPart3Pool,
  VFR_RT_P3_CORRECT_ROWS,
  VFR_RT_P3_COUNT,
} from './seed-vfr-rt-part3'

const BASE = { orgId: 'org', bankId: 'bank', subjectId: 'subj', topicId: 'topic', createdBy: 'u' }
const SUBTOPICS = ['P3_NUMBERS', 'P3_EMERGENCY', 'P3_POSREP', 'P3_PATTERN'].map((code, i) => ({
  id: `sub-${i}`,
  code,
}))

describe('buildPart3Rows', () => {
  const rows = buildPart3Rows(BASE, SUBTOPICS)

  it('seeds at least two questions in every subtopic', () => {
    for (const sub of SUBTOPICS) {
      expect(rows.filter((r) => r.row.subtopic_id === sub.id).length).toBeGreaterThanOrEqual(2)
    }
    expect(rows).toHaveLength(VFR_RT_P3_COUNT)
  })

  it('includes an ordering and a diagram_label question', () => {
    expect(rows.some((r) => r.type === 'ordering')).toBe(true)
    expect(rows.some((r) => r.type === 'diagram_label')).toBe(true)
  })

  it('gives ordering items ids derived from their own text', () => {
    const ordering = rows.find((r) => r.type === 'ordering')?.row.ordering_items as Array<{
      id: string
      text: string
    }>
    expect(ordering.length).toBeGreaterThanOrEqual(2)
    for (const item of ordering) expect(item.id).toBe(deriveContentId('o', [item.text]))
  })

  it('gives every diagram config disjoint zone and label ids and a distinct label per zone', () => {
    const cfg = rows.find((r) => r.type === 'diagram_label')?.row.diagram_config as {
      zones: Array<{ id: string }>
      labels: Array<{ id: string }>
      answer: Array<{ zone_id: string; label_id: string }>
    }
    const labelIds = new Set(cfg.labels.map((l) => l.id))
    expect(cfg.zones.length).toBeGreaterThan(0)
    expect(cfg.zones.some((z) => labelIds.has(z.id))).toBe(false)
    expect(cfg.answer).toHaveLength(cfg.zones.length)
    expect(new Set(cfg.answer.map((a) => a.label_id)).size).toBe(cfg.zones.length)
  })

  it('seeds two multiple_choice questions in a subtopic code it does not know', () => {
    const extra = buildPart3Rows(BASE, [{ id: 'x', code: 'P3_NEW' }])
    expect(extra.map((r) => r.type)).toEqual(['multiple_choice', 'multiple_choice'])
  })
})

describe('buildPart3Rows — batched insert shape', () => {
  it('gives every row the same key set so PostgREST nulls no NOT NULL column', () => {
    const rows = buildPart3Rows(BASE, SUBTOPICS).map((r) => Object.keys(r.row).sort().join(','))
    expect(new Set(rows).size).toBe(1)
  })
})

describe('VFR_RT_P3_CORRECT_ROWS', () => {
  it('counts one row per multiple-choice question, per ordering slot and per diagram zone', () => {
    // 6 multiple_choice x 1 + 1 ordering x 4 slots + 1 diagram_label x 3 zones
    expect(VFR_RT_P3_CORRECT_ROWS).toBe(13)
  })
})

function adminWithSubtopics(result: { data: unknown; error: { message: string } | null }) {
  const chain = { select: vi.fn(), eq: vi.fn() }
  chain.select.mockReturnValue(chain)
  chain.eq.mockResolvedValue(result)
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
}

describe('seedPart3Pool', () => {
  it('groups the inserted ids by question type in row order', async () => {
    const admin = adminWithSubtopics({ data: SUBTOPICS, error: null })
    const insert = vi.fn(async (rows: Record<string, unknown>[]) => rows.map((_, i) => `id-${i}`))
    const ids = await seedPart3Pool({ admin, base: BASE, insert })
    const built = buildPart3Rows(BASE, SUBTOPICS)
    const expectIds = (t: string) => built.flatMap((b, i) => (b.type === t ? [`id-${i}`] : []))
    expect(ids.orderingIds).toEqual(expectIds('ordering'))
    expect(ids.diagramIds).toEqual(expectIds('diagram_label'))
    expect(ids.mcIds).toEqual(expectIds('multiple_choice'))
    expect(ids.orderingIds).toHaveLength(1)
  })

  it('throws when no subtopics resolve', async () => {
    const admin = adminWithSubtopics({ data: [], error: null })
    await expect(seedPart3Pool({ admin, base: BASE, insert: vi.fn() })).rejects.toThrow(
      /want 4 P3_MC subtopics, got 0/,
    )
  })

  it('throws when the database holds more Part 3 subtopics than the pool constants cover', async () => {
    const extra = [...SUBTOPICS, { id: 'sub-extra', code: 'P3_EXTRA' }]
    const admin = adminWithSubtopics({ data: extra, error: null })
    await expect(seedPart3Pool({ admin, base: BASE, insert: vi.fn() })).rejects.toThrow(
      /want 4 P3_MC subtopics, got 5/,
    )
  })

  it('throws when the insert returns fewer ids than rows', async () => {
    const admin = adminWithSubtopics({ data: SUBTOPICS, error: null })
    const insert = vi.fn(async () => ['id-0', 'id-1'])
    await expect(seedPart3Pool({ admin, base: BASE, insert })).rejects.toThrow(/2 ids, 8 rows/)
  })

  it('throws when the subtopic lookup errors', async () => {
    const admin = adminWithSubtopics({ data: null, error: { message: 'boom' } })
    await expect(seedPart3Pool({ admin, base: BASE, insert: vi.fn() })).rejects.toThrow(/boom/)
  })
})
