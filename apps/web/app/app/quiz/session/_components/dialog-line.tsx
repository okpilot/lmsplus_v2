'use client'

import type { DialogLine as DialogLineModel } from '../_utils/parse-dialog-display'

export type BlankResult = { isCorrect: boolean; canonical: string }

type DialogLineProps = {
  line: DialogLineModel
  values: Record<number, string>
  onChange: (index: number, value: string) => void
  disabled: boolean
  /** Per-blank-index grading result once submitted; absent before submit. */
  results: Record<number, BlankResult>
  locked: boolean
}

const SPEAKER_LABEL: Record<'atc' | 'pilot', string> = { atc: 'ATC', pilot: 'Pilot' }

function blankClass(result: BlankResult | undefined): string {
  if (!result) return 'border-border focus:border-primary'
  return result.isCorrect
    ? 'border-green-500 bg-green-500/10'
    : 'border-destructive bg-destructive/10'
}

export function DialogLine({
  line,
  values,
  onChange,
  disabled,
  results,
  locked,
}: Readonly<DialogLineProps>) {
  return (
    // The speaker label sits in its OWN column, outside the wrapping flow. Inside a single
    // flex-wrap row every text segment is an unbreakable flex item, so a long line with no blanks
    // (a full ATC transmission) is one item too wide to sit beside the label — flex-wrap drops it
    // to the next line, stranding "ATC:" alone above its own text. With the label split out, the
    // content column starts beside the label and wraps within itself. `min-w-0` is what lets it
    // shrink below max-content and wrap at all; `items-baseline` keeps the label on the first line.
    <p className="flex items-baseline gap-2 text-sm leading-7">
      {line.speaker && (
        <span className="shrink-0 font-semibold text-muted-foreground">
          {SPEAKER_LABEL[line.speaker]}:
        </span>
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {line.segments.map((seg, i) => {
          if (seg.type === 'text') {
            // Segment list is stable per render; index key is safe here.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable parsed segments
            return <span key={`t-${i}`}>{seg.value}</span>
          }
          const result = results[seg.index]
          // Map position `i` disambiguates a template that repeats the same blank
          // index; segment list is stable per render, so the index part is safe.
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable parsed segments
            <span key={`b-${i}-${seg.index}`} className="inline-flex flex-col">
              <input
                type="text"
                value={values[seg.index] ?? ''}
                onChange={(e) => onChange(seg.index, e.target.value)}
                disabled={disabled || locked}
                aria-label={`Blank ${seg.index + 1}`}
                data-testid={`blank-${seg.index}`}
                // Grows with what the STUDENT types, never with the answer. The exam format
                // brackets whole phrases (the briefing's own example is "[descending to 2500
                // feet]", 25 chars), so a fixed box truncates a correct answer out of view. The
                // floor must stay uniform across blanks: sizing an empty box to its canonical
                // would leak the answer length, which is why blanks_safe ships index-only.
                style={{ width: `${Math.max(15, (values[seg.index] ?? '').length + 2)}ch` }}
                className={`inline-block rounded border px-2 py-1 text-sm transition-colors disabled:opacity-70 ${blankClass(result)}`}
              />
              {result && !result.isCorrect && (
                <span
                  className="text-xs text-muted-foreground"
                  data-testid={`blank-canonical-${seg.index}`}
                >
                  {result.canonical}
                </span>
              )}
            </span>
          )
        })}
      </span>
    </p>
  )
}
