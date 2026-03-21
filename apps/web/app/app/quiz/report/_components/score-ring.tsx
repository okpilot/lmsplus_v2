type Props = Readonly<{
  percentage: number
  size?: number
}>

function scoreColor(pct: number): string {
  // 70% = EASA PPL pass mark — thresholds use raw value, not rounded
  if (pct >= 70) return '#22C55E'
  if (pct >= 50) return '#F59E0B'
  return '#EF4444'
}

export function ScoreRing({ percentage, size = 120 }: Props) {
  const clamped = Math.min(100, Math.max(0, percentage))
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const rounded = Math.round(clamped)
  const offset = circumference - (clamped / 100) * circumference
  const color = scoreColor(clamped)

  return (
    <svg width={size} height={size} role="img" aria-label={`Score: ${rounded}%`}>
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
        fontSize={size * 0.22}
        fontWeight="700"
        fill={color}
      >
        {rounded}%
      </text>
    </svg>
  )
}
