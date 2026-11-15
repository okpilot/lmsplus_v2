export type StudentsTab = 'students' | 'groups'

export function readTabParam(value: string | null): StudentsTab {
  return value === 'groups' ? 'groups' : 'students'
}

export function tabHref(search: string, tab: StudentsTab): string {
  const params = new URLSearchParams(search)
  if (tab === 'groups') params.set('tab', 'groups')
  else params.delete('tab')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
