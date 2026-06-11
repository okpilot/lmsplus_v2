export function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
