import { SITTING_SCOPES, type SittingScope, type SittingStatus } from '../types'

export function readScopeParam(value: string | string[] | null | undefined): SittingScope {
  return typeof value === 'string' && (SITTING_SCOPES as readonly string[]).includes(value)
    ? (value as SittingScope)
    : 'upcoming'
}

/** Keeps the other params, sets `tab=sittings` and `scope`, drops `page` and `dlg`. */
export function scopeUrl(
  pathname: string,
  search: Pick<URLSearchParams, 'toString'>,
  scope: SittingScope,
): string {
  const params = new URLSearchParams(search.toString())
  params.set('tab', 'sittings')
  params.set('scope', scope)
  params.delete('page')
  params.delete('dlg')
  return `${pathname}?${params.toString()}`
}

/** The list scope a sitting appears in; a day-ended sitting is listed by its effective status (`list_exam_sittings`, Decision 258). */
export function sittingListScope(status: SittingStatus, dayEnded: boolean): SittingScope {
  if (status === 'scheduled') return dayEnded ? 'cancelled' : 'upcoming'
  if (status === 'open') return dayEnded ? 'past' : 'open'
  return status === 'closed' ? 'past' : 'cancelled'
}
