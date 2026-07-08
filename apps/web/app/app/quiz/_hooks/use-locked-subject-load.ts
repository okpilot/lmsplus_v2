import { useEffect, useRef } from 'react'
import type { useTopicTree } from './use-topic-tree'

/**
 * One-shot mount-time topic load for a subject-locked config form (e.g. VFR RT,
 * where the subject is fixed and never changes via `handleSubjectChange`).
 * Extracted from useQuizConfig to keep that hook within the 80-line file cap.
 *
 * No-ops when `initialSubjectId` is not provided (the ordinary quiz-picker path,
 * where topics load via `handleSubjectChange` instead). Fires at most once per
 * mount — a `useRef` guard prevents a re-fire on rerender.
 */
export function useLockedSubjectLoad(
  topicTree: ReturnType<typeof useTopicTree>,
  initialSubjectId?: string,
) {
  const loadedRef = useRef(false)

  // Mount-only: initialSubjectId is a locked value for the form's lifetime, and
  // topicTree's identity changes every render (including it would re-fire on every render).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only, see above
  useEffect(() => {
    if (!initialSubjectId) return
    if (loadedRef.current) return
    loadedRef.current = true
    topicTree.loadTopics(initialSubjectId)
  }, [])
}
