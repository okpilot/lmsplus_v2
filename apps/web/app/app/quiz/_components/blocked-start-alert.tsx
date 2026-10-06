import { Button } from '@/components/ui/button'
import type { BlockedStartState } from '../_hooks/use-blocked-start'

type BlockedStartAlertProps = {
  message: string | null
  blocked: BlockedStartState
  // What the student is starting, e.g. "quiz" or "exam" — completes "Save quiz for later and start …".
  startLabel: string
}

/** Start-failure message plus the "save the open quiz and start" offer when a practice quiz blocks. */
export function BlockedStartAlert({
  message,
  blocked,
  startLabel,
}: Readonly<BlockedStartAlertProps>) {
  const { offer, saving, error, onAccept } = blocked
  if (!message && !offer) return null
  return (
    <div className="space-y-2">
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {offer && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            Your {offer.subjectName} quiz is still open.
          </p>
          <Button type="button" variant="outline" disabled={saving} onClick={onAccept}>
            Save quiz for later and start {startLabel}
          </Button>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
