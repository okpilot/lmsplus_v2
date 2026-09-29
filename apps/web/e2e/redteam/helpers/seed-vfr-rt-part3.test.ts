import { describe, expect, it } from 'vitest'
import { deriveContentId } from '../../../scripts/content-ids'
import { buildPart3Answer, buildPart3Rows, VFR_RT_P3_COUNT } from './seed-vfr-rt-part3'

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
    expect(cfg.zones.some((z) => labelIds.has(z.id))).toBe(false)
    expect(cfg.answer).toHaveLength(cfg.zones.length)
    expect(new Set(cfg.answer.map((a) => a.label_id)).size).toBe(cfg.zones.length)
  })

  it('seeds two multiple_choice questions in a subtopic code it does not know', () => {
    const extra = buildPart3Rows(BASE, [{ id: 'x', code: 'P3_NEW' }])
    expect(extra.map((r) => r.type)).toEqual(['multiple_choice', 'multiple_choice'])
  })
})

describe('buildPart3Answer', () => {
  it('returns null for a type outside Part 3', () => {
    expect(buildPart3Answer({ id: 'q', question_type: 'short_answer' })).toBeNull()
  })

  it('matches the seeded ordering ids slot by slot', () => {
    const ordering = buildPart3Rows(BASE, SUBTOPICS).find((r) => r.type === 'ordering')?.row
      .ordering_items as Array<{ id: string }>
    const answers = buildPart3Answer({ id: 'q', question_type: 'ordering' })
    expect(answers?.map((a) => a.selected_option_id)).toEqual(ordering.map((i) => i.id))
  })
})

describe('buildPart3Rows — batched insert shape', () => {
  it('gives every row the same key set so PostgREST nulls no NOT NULL column', () => {
    const rows = buildPart3Rows(BASE, SUBTOPICS).map((r) => Object.keys(r.row).sort().join(','))
    expect(new Set(rows).size).toBe(1)
  })
})
