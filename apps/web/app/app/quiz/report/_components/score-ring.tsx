import { scoreColor } from '@/lib/utils/score-color'

type Props = Readonly<{
  percentage: number
  size?: number
}>

function ringGeometry(size: number, percentage: number) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, percentage))
  return {
    radius,
    circumference,
    clamped,
    percent: Math.round(clamped),
    offset: circumference - (clamped / 100) * circumference,
  }
}

type Geometry = ReturnType<typeof ringGeometry>

function RingArc({ size, geometry }: Readonly<{ size: number; geometry: Geometry }>) {
  const { radius, circumference, clamped, offset } = geometry
  const common = { cx: size / 2, cy: size / 2, r: radius, fill: 'none', strokeWidth: 8 }
  return (
    <>
      <circle {...common} stroke="var(--muted)" />
      <circle
        {...common}
        stroke={scoreColor(clamped, 'solid')}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </>
  )
}

function RingText({ size, geometry }: Readonly<{ size: number; geometry: Geometry }>) {
  const { clamped, percent } = geometry
  return (
    <text
      x="50%"
      y="50%"
      dominantBaseline="middle"
      textAnchor="middle"
      fontSize={size * 0.22}
      fontWeight="700"
      fill={scoreColor(clamped)}
    >
      {percent}%
    </text>
  )
}

export function ScoreRing({ percentage, size = 120 }: Readonly<Props>) {
  const geometry = ringGeometry(size, percentage)
  return (
    <svg width={size} height={size} role="img" aria-label={`Score: ${geometry.percent}%`}>
      <RingArc size={size} geometry={geometry} />
      <RingText size={size} geometry={geometry} />
    </svg>
  )
}
