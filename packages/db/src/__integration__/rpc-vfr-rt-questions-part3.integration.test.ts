/**
 * get_vfr_rt_exam_questions — Part 3 ordering / diagram_label serving (mig 20260929000300):
 * ordering items and diagram labels arrive shuffled and answer-key-free; canonical order and the
 * diagram `answer` never leave the server mid-exam.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireRpcRows } from './guards'
import { createPart3Org, forceEndSession, type Part3Org, startPart3Exam } from './vfr-rt-part3-org'

type Row = {
  id: string
  question_type: string
  ordering_items_shuffled: Array<Record<string, unknown>> | null
  diagram_config_public: Record<string, unknown> | null
  subtopic_code: string | null
}

describe('get_vfr_rt_exam_questions — Part 3 ordering and diagram serving', () => {
  let org: Part3Org
  let sessionId: string

  async function fetchRows(): Promise<Row[]> {
    const { data, error } = await org.studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    return requireRpcRows<Row>(data, 'get_vfr_rt_exam_questions')
  }

  beforeAll(async () => {
    org = await createPart3Org('qget')
    sessionId = (await startPart3Exam(org)).session_id
  })
  afterAll(async () => {
    if (sessionId) await forceEndSession(sessionId)
    await org?.cleanup()
  })

  it('serves ordering items as {id,text} only, with the same item set as the stored question', async () => {
    const rows = (await fetchRows()).filter((r) => r.question_type === 'ordering')
    expect(rows).toHaveLength(org.ordering.length)
    for (const row of rows) {
      const fixture = org.ordering.find((o) => o.id === row.id)
      expect(fixture).toBeDefined()
      // toBeDefined above guarantees fixture.
      const items = row.ordering_items_shuffled ?? []
      expect(items).toHaveLength(fixture!.items.length)
      for (const it of items) expect(Object.keys(it).sort()).toEqual(['id', 'text'])
      expect(items.map((i) => i.id).sort()).toEqual(fixture!.items.map((i) => i.id).sort())
    }
  })

  it('does not always serve ordering items in the canonical order', async () => {
    const canonical = new Map(org.ordering.map((o) => [o.id, o.items.map((i) => i.id).join('|')]))
    const seenNonCanonical = new Set<string>()
    for (let n = 0; n < 12; n++) {
      for (const row of (await fetchRows()).filter((r) => r.question_type === 'ordering')) {
        const served = (row.ordering_items_shuffled ?? []).map((i) => i.id).join('|')
        expect(served.length).toBeGreaterThan(0)
        if (served !== canonical.get(row.id)) seenNonCanonical.add(row.id)
      }
    }
    // Every ordering question deviated from the canonical order at least once in 12 fetches.
    expect([...seenNonCanonical].sort()).toEqual(org.ordering.map((o) => o.id).sort())
  })

  it('serves a diagram without its answer: zones {id,x,y,w,h} in stored order, shuffled labels', async () => {
    const row = (await fetchRows()).find((r) => r.question_type === 'diagram_label')
    expect(row).toBeDefined()
    // toBeDefined above guarantees row.
    const cfg = row!.diagram_config_public
    expect(cfg).not.toBeNull()
    expect(Object.keys(cfg ?? {}).sort()).toEqual(['image_ref', 'labels', 'zones'])
    expect('answer' in (cfg ?? {})).toBe(false)

    const zones = (cfg?.zones ?? []) as Array<Record<string, unknown>>
    expect(zones.length).toBeGreaterThan(0)
    for (const z of zones) expect(Object.keys(z).sort()).toEqual(['h', 'id', 'w', 'x', 'y'])
    expect(zones.map((z) => z.id)).toEqual(org.diagram.zones.map((z) => z.id))

    const labels = (cfg?.labels ?? []) as Array<Record<string, unknown>>
    for (const l of labels) expect(Object.keys(l).sort()).toEqual(['id', 'text'])
    // Full label set incl. the unused distractor.
    expect(labels.map((l) => l.id).sort()).toEqual(org.diagram.labels.map((l) => l.id).sort())
  })

  it('does not always serve diagram labels in stored order', async () => {
    const stored = org.diagram.labels.map((l) => l.id).join('|')
    let deviated = false
    for (let n = 0; n < 12 && !deviated; n++) {
      const row = (await fetchRows()).find((r) => r.question_type === 'diagram_label')
      const served = ((row?.diagram_config_public?.labels ?? []) as Array<{ id: string }>)
        .map((l) => l.id)
        .join('|')
      expect(served.length).toBeGreaterThan(0)
      deviated = served !== stored
    }
    expect(deviated).toBe(true)
  })

  it('leaves the ordering/diagram columns null for other types and tags Part 3 rows with their subtopic', async () => {
    const rows = await fetchRows()
    const others = rows.filter(
      (r) => r.question_type !== 'ordering' && r.question_type !== 'diagram_label',
    )
    expect(others.length).toBeGreaterThan(0)
    for (const r of others) {
      expect(r.ordering_items_shuffled).toBeNull()
      expect(r.diagram_config_public).toBeNull()
    }
    const p3 = rows.filter((r) => org.subtopicOf[r.id] !== undefined)
    expect(p3).toHaveLength(8)
    for (const r of p3) expect(r.subtopic_code).toBe(org.subtopicOf[r.id])
    for (const r of rows.filter((x) => org.subtopicOf[x.id] === undefined)) {
      expect(r.subtopic_code).toBeNull()
    }
  })

  it('exposes no answer-key column on any served row', async () => {
    const rows = await fetchRows()
    expect(rows.length).toBe(25)
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain('correct_option_id')
      expect(Object.keys(r)).not.toContain('ordering_items')
      expect(Object.keys(r)).not.toContain('diagram_config')
    }
  })
})
