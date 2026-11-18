'use client'

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

const ICON = {
  success: CircleCheck,
  caution: TriangleAlert,
  danger: CircleAlert,
} as const

const MAX_LINES = 50

function Lines({ lines }: Readonly<{ lines: readonly string[] }>) {
  const more = lines.length - MAX_LINES
  return (
    <ul className="text-foreground">
      {lines.slice(0, MAX_LINES).map((line) => (
        <li key={line}>{line}</li>
      ))}
      {more > 0 && <li>and {more} more</li>}
    </ul>
  )
}

/** The single result notice of the last action. Tone icon and background carry the outcome; text stays normal. */
export function ResultBanner() {
  const { banner, setBanner } = useSittingUi()
  if (!banner) return null
  const Icon = ICON[banner.tone]
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
      {(banner.detail || (banner.lines?.length ?? 0) > 0) && (
        <AlertDescription>
          {banner.detail && <p className="text-foreground">{banner.detail}</p>}
          {banner.lines && <Lines lines={banner.lines} />}
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
