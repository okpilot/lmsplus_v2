import { createServerSupabaseClient } from '@repo/db/server'

const DEFAULT_PART1_COUNT = 8
const DEFAULT_PART2_COUNT = 9
const DEFAULT_PART3_TOPIC = 'P3_MC'
// Part 3 draws this many questions per subtopic (start_vfr_rt_exam_session v_p3_per_sub).
const PART3_PER_SUBTOPIC = 2

type Parsed<T> = { ok: true; value: T } | { ok: false }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function partField(config: unknown, part: string, field: string): unknown {
  if (!isRecord(config)) return undefined
  const p = config[part]
  return isRecord(p) ? p[field] : undefined
}

/** Absent/null → fallback. Present → positive integer (number or integer string) else not ok. */
function parseCount(raw: unknown, fallback: number): Parsed<number> {
  if (raw === undefined || raw === null) return { ok: true, value: fallback }
  const n = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return { ok: true, value: n }
  return { ok: false }
}

function parseTopicCode(raw: unknown): Parsed<string> {
  if (raw === undefined || raw === null) return { ok: true, value: DEFAULT_PART3_TOPIC }
  if (typeof raw === 'string' && raw.length > 0) return { ok: true, value: raw }
  return { ok: false }
}

/**
 * Total questions start_vfr_rt_exam_session will draw for a fully-stocked pool:
 * part1 + part2 + 2 per Part 3 subtopic. Null when the exam cannot start or a
 * query fails (logged); callers hide the figure.
 */
export async function getVfrRtExamQuestionCount(subjectId: string): Promise<number | null> {
  const supabase = await createServerSupabaseClient()

  const { data: config, error: configError } = await supabase
    .from('exam_configs')
    .select('parts_config')
    .eq('subject_id', subjectId)
    .eq('enabled', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (configError) {
    console.error('[getVfrRtExamQuestionCount] Config query error:', configError.message)
    return null
  }
  if (!config) return null

  const parts: unknown = config.parts_config
  const p1 = parseCount(partField(parts, 'part1', 'count'), DEFAULT_PART1_COUNT)
  const p2 = parseCount(partField(parts, 'part2', 'count'), DEFAULT_PART2_COUNT)
  const topicCode = parseTopicCode(partField(parts, 'part3', 'topic_code'))
  if (!p1.ok || !p2.ok || !topicCode.ok) return null

  const subtopicCount = await countPart3Subtopics(subjectId, topicCode.value)
  if (subtopicCount === null || subtopicCount === 0) return null
  return p1.value + p2.value + PART3_PER_SUBTOPIC * subtopicCount
}

async function countPart3Subtopics(subjectId: string, topicCode: string): Promise<number | null> {
  const supabase = await createServerSupabaseClient()

  const { data: topic, error: topicError } = await supabase
    .from('easa_topics')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('code', topicCode)
    .maybeSingle()
  if (topicError) {
    console.error('[getVfrRtExamQuestionCount] Topic query error:', topicError.message)
    return null
  }
  if (!topic) return null

  const { count, error: countError } = await supabase
    .from('easa_subtopics')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', topic.id)
  if (countError) {
    console.error('[getVfrRtExamQuestionCount] Subtopic count error:', countError.message)
    return null
  }
  return count ?? 0
}
