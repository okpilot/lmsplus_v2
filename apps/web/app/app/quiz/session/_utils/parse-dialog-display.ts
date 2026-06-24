// Pure parser for the STRIPPED dialog template the client receives.
// Canonicals are removed server-side by get_quiz_questions / get_vfr_rt_exam_questions
// (mig 105), so blanks arrive as bare `{{n}}` markers — never `{{n|canonical;syn}}`.

export type DialogSegment = { type: 'text'; value: string } | { type: 'blank'; index: number }

export type DialogLine = {
  speaker: 'atc' | 'pilot' | null
  segments: DialogSegment[]
}

const SPEAKER_RE = /^\[(atc|pilot)\]\s?/
// Captures the leading integer of a blank marker. Defensive: if a `|` somehow
// survives stripping, only the leading integer is consumed and the rest ignored.
const BLANK_RE = /\{\{(\d+)(?:\|[^}]*)?\}\}/g

function parseSegments(text: string): DialogSegment[] {
  const segments: DialogSegment[] = []
  let lastIndex = 0
  BLANK_RE.lastIndex = 0

  let match = BLANK_RE.exec(text)
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    // match[1] is the \d+ capture group — guaranteed present when BLANK_RE matches.
    segments.push({ type: 'blank', index: Number.parseInt(match[1] ?? '0', 10) })
    lastIndex = match.index + match[0].length
    match = BLANK_RE.exec(text)
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

function parseLine(rawLine: string): DialogLine {
  const speakerMatch = SPEAKER_RE.exec(rawLine)
  const speaker = speakerMatch ? (speakerMatch[1] as 'atc' | 'pilot') : null
  const body = speakerMatch ? rawLine.slice(speakerMatch[0].length) : rawLine
  return { speaker, segments: parseSegments(body) }
}

export function parseDialogDisplay(template: string): DialogLine[] {
  return template
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine)
}
