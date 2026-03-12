'use server'

import { getSubtopicsForTopic, getTopicsForSubject } from '@/lib/queries/quiz'
import type { SubtopicOption, TopicOption } from '@/lib/queries/quiz'

export async function fetchTopicsForSubject(subjectId: string): Promise<TopicOption[]> {
  return getTopicsForSubject(subjectId)
}

export async function fetchSubtopicsForTopic(topicId: string): Promise<SubtopicOption[]> {
  return getSubtopicsForTopic(topicId)
}
