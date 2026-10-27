import type { TopicInfo } from '../types'

/** Questions still drawable at topic level: pool minus what each sub-topic draws (capped at its own pool). */
export function topicRemaining(
  topic: TopicInfo,
  getCount: (topicId: string, subtopicId: string | null) => number,
): number {
  if (topic.subtopics.length === 0) return topic.availableQuestions
  const drawn = topic.subtopics.reduce(
    (sum, st) => sum + Math.min(getCount(topic.id, st.id), st.availableQuestions),
    0,
  )
  return Math.max(0, topic.availableQuestions - drawn)
}
