const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-pink-500',
  'bg-cyan-500',
]

export function getAvatarColor(name: string): string {
  const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[index] ?? 'bg-blue-500'
}

export function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
