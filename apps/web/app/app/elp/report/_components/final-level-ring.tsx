// Adapted from the quiz report ScoreRing for the ICAO 1–6 oral scale: the arc
// fills to level / 6 and the centre shows the level number, not a percentage.
type Props = Readonly<{ level: number | null; size?: number }>

const LEVEL_MAX = 6

function levelColor(level: number | null): string {
  if (level === null) return '#9CA3AF' // grey — not yet graded
  if (level >= 4) return '#22C55E' // green — ICAO operational (pass) level 4+
  if (level === 3) return '#F59E0B' // amber — pre-operational
  return '#EF4444' // red — below operational
}

export function FinalLevelRing({ level, size = 120 }: Props) {
  const clamped = level === null ? 0 : Math.min(LEVEL_MAX, Math.max(0, level))
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / LEVEL_MAX) * circumference
  const color = levelColor(level)
  const label = level === null ? '—' : String(level)

  return (
    <svg width={size} height={size} role="img" aria-label={`ICAO level: ${label} of ${LEVEL_MAX}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={8} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.28}
        fontWeight="700"
        fill={color}
      >
        {label}
      </text>
    </svg>
  )
}
