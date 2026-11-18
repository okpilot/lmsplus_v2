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
      {banner.detail && (
        <AlertDescription>
          <p className="text-foreground">{banner.detail}</p>
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
