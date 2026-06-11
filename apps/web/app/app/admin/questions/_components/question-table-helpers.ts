export function difficultyVariant(d: string) {
  switch (d) {
    case 'easy':
      return 'secondary' as const
    case 'medium':
      return 'default' as const
    case 'hard':
      return 'destructive' as const
    default:
      return 'secondary' as const
  }
}

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
