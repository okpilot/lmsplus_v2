type Props = {
  percentage: number
  size?: number
}

export function ScoreRing({ percentage, size = 120 }: Props) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const rounded = Math.round(percentage)
  const offset = circumference - (percentage / 100) * circumference

  // 70% = EASA PPL pass mark — thresholds use raw value, not rounded
  const color = percentage >= 70 ? '#22C55E' : percentage >= 50 ? '#F59E0B' : '#EF4444'

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
