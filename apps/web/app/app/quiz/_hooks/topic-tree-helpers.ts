import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'

export type UseTopicTreeReturn = {
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  allSelected: boolean
  isPending: boolean
  totalQuestions: number
  selectedQuestionCount: number
  loadTopics: (subjectId: string) => void
  toggleTopic: (topicId: string) => void
  toggleSubtopic: (subtopicId: string, topicId: string) => void
  selectAll: () => void
  reset: () => void
  getSelectedTopicIds: () => string[]
  getSelectedSubtopicIds: () => string[]
}

export function collectSubtopicIds(items: TopicWithSubtopics[]): string[] {
  return items.flatMap((t) => t.subtopics.map((st) => st.id))
}

export function calcSelectedCount(
  topics: TopicWithSubtopics[],
  checkedTopics: Set<string>,
  checkedSubtopics: Set<string>,
): number {
  return topics.reduce((sum, t) => {
    if (t.subtopics.length === 0) return sum + (checkedTopics.has(t.id) ? t.questionCount : 0)
    return (
      sum +
      t.subtopics.reduce((s, st) => s + (checkedSubtopics.has(st.id) ? st.questionCount : 0), 0)
    )
  }, 0)
}

export function computeToggleTopic(
  topicId: string,
  topics: TopicWithSubtopics[],
  checkedTopics: Set<string>,
  checkedSubtopics: Set<string>,
): { topics: Set<string>; subtopics: Set<string> } {
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return { topics: checkedTopics, subtopics: checkedSubtopics }
  const adding = !checkedTopics.has(topicId)
  const newTopics = new Set(checkedTopics)
  adding ? newTopics.add(topicId) : newTopics.delete(topicId)
  const newSubtopics = new Set(checkedSubtopics)
  for (const st of topic.subtopics) adding ? newSubtopics.add(st.id) : newSubtopics.delete(st.id)
  return { topics: newTopics, subtopics: newSubtopics }
}

export function computeToggleSubtopic(
  subtopicId: string,
  topicId: string,
  topics: TopicWithSubtopics[],
  checkedTopics: Set<string>,
  checkedSubtopics: Set<string>,
): { topics: Set<string>; subtopics: Set<string> } {
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return { topics: checkedTopics, subtopics: checkedSubtopics }
  const newSubtopics = new Set(checkedSubtopics)
  newSubtopics.has(subtopicId) ? newSubtopics.delete(subtopicId) : newSubtopics.add(subtopicId)
  const allChecked = topic.subtopics.every((st) => newSubtopics.has(st.id))
  const newTopics = new Set(checkedTopics)
  allChecked ? newTopics.add(topicId) : newTopics.delete(topicId)
  return { topics: newTopics, subtopics: newSubtopics }
}

export function calcFilteredAvailable(
  topics: TopicWithSubtopics[],
  checkedTopics: Set<string>,
  checkedSubtopics: Set<string>,
  filteredByTopic: Record<string, number>,
  filteredBySubtopic: Record<string, number>,
): number {
  let total = 0
  for (const topic of topics) {
    if (topic.subtopics.length === 0) {
      if (checkedTopics.has(topic.id)) total += filteredByTopic[topic.id] ?? 0
    } else {
      for (const st of topic.subtopics) {
        if (checkedSubtopics.has(st.id)) total += filteredBySubtopic[st.id] ?? 0
      }
    }
  }
  return total
}

export function computeAvailableCount(opts: {
  hasActiveFilters: boolean
  // Discovery forces the MC-aware filtered counts even with no active filter, so the
  // slider max / Start button never overstate the MC-only pool on a mixed subject (#1008).
  preferFiltered?: boolean
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  selectedQuestionCount: number
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
}): number {
  if (!opts.hasActiveFilters && !opts.preferFiltered) {
    return opts.selectedQuestionCount
  }
  if (!opts.filteredByTopic || !opts.filteredBySubtopic) {
    // Filtered maps not loaded yet. On the Discovery (preferFiltered) path fall back to
    // 0 — never show the type-agnostic topic-tree total as the MC-only max; the
    // active-filter path keeps the topic-tree fallback during the brief pending window.
    return opts.preferFiltered ? 0 : opts.selectedQuestionCount
  }
  return calcFilteredAvailable(
    opts.topics,
    opts.checkedTopics,
    opts.checkedSubtopics,
    opts.filteredByTopic,
    opts.filteredBySubtopic,
  )
}

export function computeSelectAll(
  allSelected: boolean,
  topics: TopicWithSubtopics[],
): { topics: Set<string>; subtopics: Set<string> } {
  if (allSelected) return { topics: new Set(), subtopics: new Set() }
  return {
    topics: new Set(topics.map((t) => t.id)),
    subtopics: new Set(topics.flatMap((t) => t.subtopics.map((st) => st.id))),
  }
}
