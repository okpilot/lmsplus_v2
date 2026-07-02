type Props = Readonly<{ level: number }>

function levelClasses(level: number): string {
  if (level >= 4) return 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
  if (level === 3) return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
}

export function LevelBadge({ level }: Props) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${levelClasses(level)}`}
    >
      Level {level}
    </span>
  )
}
