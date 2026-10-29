import { InsetPanel } from '@/components/kit/inset-panel'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
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
      <FieldError role="alert">{message}</FieldError>
      {offer && (
        <InsetPanel className="space-y-2">
          <p className="text-body text-muted-foreground">
            Your {offer.subjectName} quiz is still open.
          </p>
          <Button type="button" variant="outline" disabled={saving} onClick={onAccept}>
            Save quiz for later and start {startLabel}
          </Button>
          <FieldError role="alert">{error}</FieldError>
        </InsetPanel>
      )}
    </div>
  )
}
