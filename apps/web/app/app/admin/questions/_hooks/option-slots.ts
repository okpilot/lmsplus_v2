import type { QuestionOption } from '../types'

export const OPTION_IDS = ['a', 'b', 'c', 'd'] as const

export function buildOptionSlots(options: QuestionOption[]) {
  const unusedIds = OPTION_IDS.filter((letter) => !options.some((opt) => opt.id === letter))
  return OPTION_IDS.map((letter, idx) => ({
    letter,
    id: options[idx]?.id ?? unusedIds[idx - options.length] ?? letter,
  }))
}

export function withOptionText(
  options: QuestionOption[],
  idx: number,
  text: string,
): QuestionOption[] {
  return buildOptionSlots(options).map(({ id }, i) => ({
    id,
    text: i === idx ? text : (options[i]?.text ?? ''),
  }))
}
