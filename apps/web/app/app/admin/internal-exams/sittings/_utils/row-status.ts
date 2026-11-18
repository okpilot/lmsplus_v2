import { LIVE_ENTRY_STATUSES, type RosterEntry, type SittingStatus } from '../types'

export type RowStatus = { label: string; tone: 'neutral' | 'success' | 'danger'; caption?: string }

type Input = Readonly<{
  sittingStatus: SittingStatus
  deactivated: boolean
  entries: readonly Pick<RosterEntry, 'status' | 'passed'>[]
}>

type Entries = Input['entries']

const NEEDS_CODE: ReadonlySet<string> = new Set(['no_code', 'expired', 'voided'])
const VOIDED: ReadonlySet<string> = new Set(['voided', 'voided_attempt'])
const DONE: ReadonlySet<string> = new Set([
  'finished',
  'absent',
  'voided',
  'voided_attempt',
  'discarded',
])

const count = (entries: Entries, pred: (s: string) => boolean) =>
  entries.filter((e) => pred(e.status)).length

/** "2 finished · 1 absent": zero parts are omitted. */
function breakdown(parts: readonly (readonly [number, string])[]): string {
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(' · ')
}

function scheduled(entries: Entries): RowStatus {
  if (entries.some((e) => NEEDS_CODE.has(e.status))) {
    const have = count(entries, (s) => LIVE_ENTRY_STATUSES.has(s))
    return {
      label: 'Needs codes',
      tone: 'neutral',
      caption: `${have} of ${entries.length} have codes`,
    }
  }
  return { label: 'Ready', tone: 'success' }
}

function open(entries: Entries): RowStatus {
  const absent = count(entries, (s) => s === 'absent')
  if (absent === entries.length) return { label: 'Absent', tone: 'danger' }
  const done = count(entries, (s) => DONE.has(s))
  if (done === entries.length) {
    const caption = breakdown([
      [count(entries, (s) => s === 'finished'), 'finished'],
      [absent, 'absent'],
      [count(entries, (s) => VOIDED.has(s)), 'voided'],
      [count(entries, (s) => s === 'discarded'), 'discarded'],
    ])
    return { label: 'Done', tone: 'success', caption }
  }
  if (done > 0 || entries.some((e) => e.status === 'running')) {
    return { label: 'In progress', tone: 'neutral', caption: `${done} of ${entries.length} done` }
  }
  return { label: 'Not started', tone: 'neutral' }
}

function closed(entries: Entries): RowStatus {
  const of = (status: string) => count(entries, (s) => s === status)
  const passed = entries.filter((e) => e.status === 'finished' && e.passed === true).length
  const failed = entries.filter((e) => e.status === 'finished' && e.passed === false).length
  const [running, finished] = [of('running'), of('finished')]
  const [discarded, voidedAttempt] = [of('discarded'), of('voided_attempt')]
  const caption = breakdown([
    [passed, 'passed'],
    [failed, 'failed'],
    [running, 'running'],
    [of('absent'), 'absent'],
    [voidedAttempt, 'attempt voided'],
    [discarded, 'discarded'],
  ])
  const withCaption = (s: RowStatus): RowStatus =>
    caption && caption !== s.label ? { ...s, caption } : s
  if (failed > 0) return withCaption({ label: `${failed} failed`, tone: 'danger' })
  if (running > 0) return withCaption({ label: 'In progress', tone: 'neutral' })
  if (finished > 0) return withCaption({ label: 'All passed', tone: 'success' })
  if (discarded > 0) return withCaption({ label: 'Attempt discarded', tone: 'neutral' })
  if (voidedAttempt > 0) return withCaption({ label: 'Attempt voided', tone: 'neutral' })
  return { label: 'Absent', tone: 'neutral' }
}

/** One status per person (first match of the spec table); null when the sitting shows none. */
export function rowStatus({ sittingStatus, deactivated, entries }: Input): RowStatus | null {
  if (deactivated) return { label: 'Deactivated', tone: 'neutral' }
  if (entries.length === 0) return { label: 'No exams', tone: 'neutral' }
  if (sittingStatus === 'scheduled') return scheduled(entries)
  if (sittingStatus === 'open') return open(entries)
  if (sittingStatus === 'closed') return closed(entries)
  return null
}
