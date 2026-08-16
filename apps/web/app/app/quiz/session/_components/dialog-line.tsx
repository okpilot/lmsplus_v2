'use client'

import type { BlankResult } from '../_utils/dialog-fill-helpers'
import type { DialogLine as DialogLineModel } from '../_utils/parse-dialog-display'
import { DialogBlank, type OnBlankEnter } from './dialog-blank'

type DialogLineProps = {
  line: DialogLineModel
  values: Record<number, string>
  onChange: (index: number, value: string) => void
  disabled: boolean
  /** Per-blank-index grading result once submitted; absent before submit. */
  results: Record<number, BlankResult>
  locked: boolean
  /** Enter pressed in a blank on this line. Submits or advances — the parent decides. */
  onEnter?: OnBlankEnter
}

const SPEAKER_LABEL: Record<'atc' | 'pilot', string> = { atc: 'ATC', pilot: 'Pilot' }

// The speaker label sits in its OWN column, outside the wrapping flow. Inside a single flex-wrap
// row every text segment is an unbreakable flex item, so a long line with no blanks (a full ATC
// transmission) is one item too wide to sit beside the label — flex-wrap drops it to the next
// line, stranding "ATC:" alone above its own text. With the label split out, the content column
// starts beside the label and wraps within itself. `min-w-0` is what lets it shrink below
// max-content and wrap at all; `items-baseline` keeps the label on the first line.
export function DialogLine({
  line,
  values,
  onChange,
  disabled,
  results,
  locked,
  onEnter,
}: Readonly<DialogLineProps>) {
  return (
    <p className="flex items-baseline gap-2 text-sm leading-7">
      {line.speaker && (
        <span className="shrink-0 font-semibold text-muted-foreground">
          {SPEAKER_LABEL[line.speaker]}:
        </span>
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {line.segments.map((seg, i) =>
          seg.type === 'text' ? (
            // Segment list is stable per render; index key is safe here.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable parsed segments
            <span key={`t-${i}`}>{seg.value}</span>
          ) : (
            <DialogBlank
              // Map position `i` disambiguates a template that repeats the same blank index;
              // the segment list is stable per render, so the index part is safe.
              // biome-ignore lint/suspicious/noArrayIndexKey: stable parsed segments
              key={`b-${i}-${seg.index}`}
              index={seg.index}
              value={values[seg.index] ?? ''}
              onChange={onChange}
              disabled={disabled || locked}
              result={results[seg.index]}
              onEnter={onEnter}
            />
          ),
        )}
      </span>
    </p>
  )
}
