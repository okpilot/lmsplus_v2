import { plural } from './plural'

export function noCodeLine(n: number): string {
  return `${plural(n, 'exam')} ${n === 1 ? 'has' : 'have'} no code yet. They cannot start until you issue codes.`
}

type StartData = { entriesWithoutCode: number; codesRestamped: number; invigilatorActive: boolean }

export function startResultBanner(
  d: StartData,
  invigilatorName: string,
): { tone: 'success' | 'caution'; title: string; detail: string | undefined } {
  const notes: string[] = []
  if (d.entriesWithoutCode > 0) notes.push(noCodeLine(d.entriesWithoutCode))
  if (d.invigilatorActive === false)
    notes.push(
      `The assigned invigilator ${invigilatorName} is no longer an active admin or instructor.`,
    )
  if (notes.length > 0)
    return { tone: 'caution', title: 'Sitting started.', detail: notes.join(' ') }
  return {
    tone: 'success',
    title: 'Sitting started.',
    detail:
      d.codesRestamped > 0
        ? `${plural(d.codesRestamped, 'code')} will work until you close the sitting.`
        : undefined,
  }
}
