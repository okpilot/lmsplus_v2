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
  const skipped = banner.skipped ?? []
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
      {(banner.detail || skipped.length > 0) && (
        <AlertDescription>
          <div className="space-y-1 text-foreground">
            {banner.detail && <p>{banner.detail}</p>}
            {skipped.length > 0 && (
              <>
                <p className="font-medium">{banner.skippedTitle}</p>
                <ul className="list-disc pl-prose-indent">
                  {skipped.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {(banner.more ?? 0) > 0 && <p>and {banner.more} more.</p>}
              </>
            )}
          </div>
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
