/** First letters of the first two words, upper-case; an email yields one letter; blank yields '?'. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1 || words.some((w) => w.includes('@')))
    return (words[0]?.[0] ?? '?').toUpperCase()
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
}
