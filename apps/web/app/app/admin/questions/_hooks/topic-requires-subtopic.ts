import type { SyllabusTree } from '../../syllabus/types'

export function topicRequiresSubtopic(
  tree: SyllabusTree,
  subjectId: string | undefined,
  topicId: string | undefined,
): boolean {
  const topic = tree.find((s) => s.id === subjectId)?.topics.find((t) => t.id === topicId)
  return (topic?.subtopics.length ?? 0) > 0
}
