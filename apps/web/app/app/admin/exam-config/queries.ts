import { requireAdmin } from '@/lib/auth/require-admin'
import type {
  ExamConfig,
  ExamConfigDistribution,
  SubjectWithConfig,
  SubtopicInfo,
  TopicInfo,
} from './types'

export async function getExamConfigData(): Promise<SubjectWithConfig[]> {
  const { supabase, organizationId } = await requireAdmin()

  // Fetch all data in parallel
  const [subjectsRes, topicsRes, subtopicsRes, configsRes, distributionsRes, questionsRes] =
    await Promise.all([
      supabase.from('easa_subjects').select('id, code, name, short').order('sort_order'),
      supabase.from('easa_topics').select('id, subject_id, code, name').order('sort_order'),
      supabase.from('easa_subtopics').select('id, topic_id, code, name').order('sort_order'),
      supabase
        .from('exam_configs')
        .select('id, subject_id, enabled, total_questions, time_limit_seconds, pass_mark')
        .eq('organization_id', organizationId)
        .is('deleted_at', null),
      supabase
        .from('exam_config_distributions')
        .select('id, exam_config_id, topic_id, subtopic_id, question_count'),
      supabase
        .from('questions')
        .select('subject_id, topic_id, subtopic_id')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .is('deleted_at', null),
    ])

  // Throw on any query error so the Suspense error boundary catches it
  for (const res of [
    subjectsRes,
    topicsRes,
    subtopicsRes,
    configsRes,
    distributionsRes,
    questionsRes,
  ]) {
    if (res.error) throw new Error(`[getExamConfigData] ${res.error.message}`)
  }

  const subjects = subjectsRes.data ?? []
  const topics = topicsRes.data ?? []
  const subtopics = subtopicsRes.data ?? []
  const configs = configsRes.data ?? []
  // Distributions are org-scoped via RLS on parent exam_configs
  const distributions = distributionsRes.data ?? []
  const questions = questionsRes.data ?? []

  // Count questions per topic/subtopic
  const topicCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()
  for (const q of questions) {
    if (q.topic_id) topicCounts.set(q.topic_id, (topicCounts.get(q.topic_id) ?? 0) + 1)
    if (q.subtopic_id)
      subtopicCounts.set(q.subtopic_id, (subtopicCounts.get(q.subtopic_id) ?? 0) + 1)
  }

  // Build config map
  const configMap = new Map(configs.map((c) => [c.subject_id, c]))

  return subjects.map((s) => {
    const config = configMap.get(s.id)
    const subjectTopics = topics.filter((t) => t.subject_id === s.id)

    const topicInfos: TopicInfo[] = subjectTopics.map((t) => {
      const topicSubtopics = subtopics.filter((st) => st.topic_id === t.id)
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        availableQuestions: topicCounts.get(t.id) ?? 0,
        subtopics: topicSubtopics.map(
          (st): SubtopicInfo => ({
            id: st.id,
            code: st.code,
            name: st.name,
            availableQuestions: subtopicCounts.get(st.id) ?? 0,
          }),
        ),
      }
    })

    let examConfig: ExamConfig | null = null
    if (config) {
      const configDistributions = distributions.filter((d) => d.exam_config_id === config.id)
      examConfig = {
        id: config.id,
        subjectId: s.id,
        enabled: config.enabled,
        totalQuestions: config.total_questions,
        timeLimitSeconds: config.time_limit_seconds,
        passMark: config.pass_mark,
        distributions: configDistributions.map((d): ExamConfigDistribution => {
          const topic = topics.find((t) => t.id === d.topic_id)
          const subtopic = d.subtopic_id ? subtopics.find((st) => st.id === d.subtopic_id) : null
          return {
            id: d.id,
            topicId: d.topic_id,
            topicCode: topic?.code ?? '',
            topicName: topic?.name ?? '',
            subtopicId: d.subtopic_id,
            subtopicCode: subtopic?.code ?? null,
            subtopicName: subtopic?.name ?? null,
            questionCount: d.question_count,
            availableQuestions: d.subtopic_id
              ? (subtopicCounts.get(d.subtopic_id) ?? 0)
              : (topicCounts.get(d.topic_id) ?? 0),
          }
        }),
      }
    }

    return {
      id: s.id,
      code: s.code,
      name: s.name,
      short: s.short,
      config: examConfig,
      topics: topicInfos,
    }
  })
}
