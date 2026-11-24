/** `plural(1, 'exam')` -> "1 exam"; `plural(2, 'person', 'people')` -> "2 people". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
