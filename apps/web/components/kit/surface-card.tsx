import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SurfaceCardProps = {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}

// oklab on purpose: oklch mixing drops the hue.
const SURFACE_CLASSES =
  'rounded-3xl bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] ring-1 ring-surface-ring backdrop-blur-2xl [box-shadow:var(--surface-highlight),var(--surface-shadow)]'

export function SurfaceCard({ children, className, as: Tag = 'div' }: Readonly<SurfaceCardProps>) {
  return <Tag className={cn(SURFACE_CLASSES, className)}>{children}</Tag>
}
