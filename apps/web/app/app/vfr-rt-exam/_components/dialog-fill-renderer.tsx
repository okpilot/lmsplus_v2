'use client'

import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import {
  type DialogLine,
  type DialogSegment,
  parseDialogDisplay,
} from '../_utils/parse-dialog-display'

type DialogFillRendererProps = {
  template: string
  values: Record<number, string>
  onChange: (blankIndex: number, next: string) => void
  disabled?: boolean
}

const SPEAKER_LABEL: Record<'atc' | 'pilot', string> = { atc: 'ATC', pilot: 'Pilot' }

function SpeakerBadge({ speaker }: { speaker: DialogLine['speaker'] }) {
  if (!speaker) return null
  return (
    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
      {SPEAKER_LABEL[speaker]}
    </span>
  )
}

// Assigns a stable, non-index React key to each segment. Blanks key off their
// globally-unique index; text keys off the surrounding blank boundary so they
// stay unique among siblings without using the array index.
function withKeys(segments: DialogSegment[]): { segment: DialogSegment; key: string }[] {
  let boundary = -1
  return segments.map((segment) => {
    if (segment.type === 'blank') {
      boundary = segment.index
      return { segment, key: `blank-${segment.index}` }
    }
    return { segment, key: `text-${boundary}-${segment.value}` }
  })
}

// Blank indices are globally unique, so a line carrying blanks keys off them.
// Blank-less lines fall back to the line position (identical rote-readback
// lines like two "[atc] Roger." turns would otherwise collide on speaker+text).
function lineKey(line: DialogLine, i: number): string {
  const blankIndices = line.segments
    .filter((s) => s.type === 'blank')
    .map((s) => s.index)
    .join('-')
  if (blankIndices.length > 0) return `line-b${blankIndices}`
  return `line-${i}-${line.speaker ?? 'none'}`
}

export function DialogFillRenderer({
  template,
  values,
  onChange,
  disabled,
}: DialogFillRendererProps) {
  const lines = parseDialogDisplay(template)

  return (
    <div className="space-y-2 text-sm leading-7">
      {lines.map((line, i) => (
        <p key={lineKey(line, i)} className="flex flex-wrap items-baseline">
          <SpeakerBadge speaker={line.speaker} />
          {withKeys(line.segments).map(({ segment, key }) => {
            if (segment.type === 'text') {
              return <Fragment key={key}>{segment.value}</Fragment>
            }
            return (
              <input
                key={key}
                type="text"
                aria-label={`Blank ${segment.index + 1}`}
                value={values[segment.index] ?? ''}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => onChange(segment.index, e.target.value)}
                className={cn(
                  'mx-1 inline-block w-32 rounded border border-input bg-transparent px-2 py-0.5 text-sm',
                  'focus:border-primary focus:outline-none',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              />
            )
          })}
        </p>
      ))}
    </div>
  )
}
