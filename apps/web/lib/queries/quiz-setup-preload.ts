import { cache } from 'react'
import type { QuizSetupPreload } from '@/app/app/quiz/types'
import { getDiscoveryCounts } from './discovery-counts'
import { getSubjectsWithCounts } from './quiz-subject-queries'
import { getAllTopicTrees } from './quiz-topic-trees'

/** Runs one preload read; a failure is logged and degrades to `fallback`. */
async function settle<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (err) {
    console.error(`[quizSetupPreload] ${label} failed:`, err)
    return fallback
  }
}

function pick<T>(source: Record<string, T>, ids: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(source).filter(([id]) => ids.has(id)))
}

/**
 * Everything the setup form can show without a request: topic trees and Discovery counts
 * of the subjects the picker lists. Never rejects — a failed read is logged and left empty,
 * so the form falls back to the per-subject actions. Argument-free and `cache()`d so the
 * page's warm-up and `SubjectsSection` share one invocation (and one log line).
 */
export const loadQuizSetupPreload = cache(async (): Promise<QuizSetupPreload> => {
  const [subjects, trees, counts] = await Promise.all([
    settle('subjects', getSubjectsWithCounts, []),
    settle('topic trees', getAllTopicTrees, {}),
    settle('counts', getDiscoveryCounts, {}),
  ])
  const ids = new Set(subjects.map((s) => s.id))
  return { topicsBySubject: pick(trees, ids), discoveryCounts: counts }
})
