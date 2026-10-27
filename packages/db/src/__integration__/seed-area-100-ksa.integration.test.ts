import { describe, expect, it } from 'vitest'
import { getAdminClient } from './setup'

/** #1639: Area 100 KSA syllabus seed (ATPL_A). */
describe('Area 100 KSA seed', () => {
  const admin = getAdminClient()

  async function subject() {
    const { data, error } = await admin
      .from('easa_subjects')
      .select('id, code, name, short, course_id')
      .eq('code', '100')
      .maybeSingle()
    expect(error).toBeNull()
    return data
  }

  async function topicCodes(subjectId: string): Promise<Record<string, string>> {
    const { data, error } = await admin
      .from('easa_topics')
      .select('id, code')
      .eq('subject_id', subjectId)
    expect(error).toBeNull()
    return Object.fromEntries((data ?? []).map((t) => [t.code as string, t.id as string]))
  }

  async function subtopics(topicId: string) {
    const { data, error } = await admin
      .from('easa_subtopics')
      .select('code, sort_order')
      .eq('topic_id', topicId)
    expect(error).toBeNull()
    return (data ?? []).sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
  }

  it('AC1: subject 100 belongs to ATPL_A and is named Area 100 KSA', async () => {
    const { data: course } = await admin.from('courses').select('id').eq('code', 'ATPL_A').single()
    const s = await subject()
    expect(s).not.toBeNull()
    expect(s?.name).toBe('Area 100 KSA')
    expect(s?.short).toBe('KSA')
    expect(s?.course_id).toBe(course?.id)
  })

  it('AC2: subject 100 has exactly topics 100-01 to 100-04', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const codes = Object.keys(await topicCodes(s?.id as string)).sort()
    expect(codes).toEqual(['100-01', '100-02', '100-03', '100-04'])
  })

  it('AC3: 100-02 has sub-topics 100-02-01 to 100-02-05', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const topics = await topicCodes(s?.id as string)
    expect(topics['100-02']).toBeTruthy()
    const subs = await subtopics(topics['100-02'] as string)
    expect(subs.map((x) => x.code)).toEqual([1, 2, 3, 4, 5].map((n) => `100-02-0${n}`))
  })

  it('AC3: 100-03 has sub-topics 100-03-01 and 100-03-02', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const topics = await topicCodes(s?.id as string)
    expect(topics['100-03']).toBeTruthy()
    const subs = await subtopics(topics['100-03'] as string)
    expect(subs.map((x) => x.code)).toEqual(['100-03-01', '100-03-02'])
  })

  it('AC3: 100-04 has sub-topics 100-04-01 to 100-04-11 with sort_order 1 to 11', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const topics = await topicCodes(s?.id as string)
    expect(topics['100-04']).toBeTruthy()
    const subs = await subtopics(topics['100-04'] as string)
    const codes = Array.from({ length: 11 }, (_, i) => `100-04-${String(i + 1).padStart(2, '0')}`)
    expect(subs.map((x) => x.code)).toEqual(codes)
    expect(subs.map((x) => x.sort_order)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1))
  })

  it('AC3: 100-01 has no sub-topics', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const topics = await topicCodes(s?.id as string)
    expect(topics['100-01']).toBeTruthy()
    expect(await subtopics(topics['100-01'] as string)).toEqual([])
  })

  it('AC4: no exam config is seeded for subject 100', async () => {
    const s = await subject()
    expect(s).not.toBeNull()
    const { data, error } = await admin
      .from('exam_configs')
      .select('id')
      .eq('subject_id', s?.id as string)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
