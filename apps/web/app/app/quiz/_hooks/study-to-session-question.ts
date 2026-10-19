import type { SessionQuestion } from '@/app/app/_types/session'
import type { StudyQuestion } from '@/lib/queries/study-queries'

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}

/**
 * Maps a Discovery `StudyQuestion` to the runner's answer-stripped `SessionQuestion`:
 * options shuffled on a copy, the correct key and study metadata dropped.
 */
export function toSessionQuestion(
  q: StudyQuestion,
  random: () => number = Math.random,
): SessionQuestion {
  return {
    id: q.id,
    question_text: q.questionText,
    question_image_url: q.questionImageUrl,
    question_number: q.questionNumber,
    options: shuffled(q.options, random),
    explanation_text: q.explanationText,
    explanation_image_url: q.explanationImageUrl,
    question_type: 'multiple_choice',
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
  }
}
