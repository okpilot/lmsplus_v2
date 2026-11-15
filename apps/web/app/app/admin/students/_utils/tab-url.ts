export type StudentsTab = 'students' | 'groups'

export function readTabParam(value: string | null): StudentsTab {
  return value === 'groups' ? 'groups' : 'students'
}

export function parseTabParam(value: string | string[] | undefined): StudentsTab {
  return typeof value === 'string' ? readTabParam(value) : 'students'
}

export function tabHref(search: string, tab: StudentsTab): string {
  const params = new URLSearchParams(search)
  if (tab === 'groups') params.set('tab', 'groups')
  else params.delete('tab')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
