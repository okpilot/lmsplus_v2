'use client'

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

/** Most lines a banner lists; the rest is counted. */
const MAX_LINES = 50

const ICON = {
  success: CircleCheck,
  caution: TriangleAlert,
  danger: CircleAlert,
} as const

function BannerLines({ lines }: Readonly<{ lines: readonly string[] }>) {
  // Keyed by position: the same line can repeat.
  const shown = lines.slice(0, MAX_LINES).map((text, position) => ({ position, text }))
  const rest = lines.length - shown.length
  return (
    <>
      <ul className="mt-1 space-y-1 text-foreground">
        {shown.map((l) => (
          <li key={l.position}>{l.text}</li>
        ))}
      </ul>
      {rest > 0 && <p className="text-foreground">and {rest} more.</p>}
    </>
  )
}

/** The single result notice of the last action. Tone icon and background carry the outcome; text stays normal. */
export function ResultBanner() {
  const { banner, setBanner } = useSittingUi()
  if (!banner) return null
  const Icon = ICON[banner.tone]
  const lines = banner.lines ?? []
  return (
    <Alert
      tone={banner.tone}
      size="compact"
      layout="row"
      role={banner.tone === 'danger' ? 'alert' : 'status'}
    >
      <AlertTitle className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-icon shrink-0" />
        <span className="text-foreground">{banner.title}</span>
      </AlertTitle>
      {(banner.detail || lines.length > 0) && (
        <AlertDescription>
          {banner.detail && <p className="text-foreground">{banner.detail}</p>}
          {lines.length > 0 && <BannerLines lines={lines} />}
        </AlertDescription>
      )}
      <AlertAction>
        <Button size="sm" variant="ghost" onClick={() => setBanner(null)}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  )
}
