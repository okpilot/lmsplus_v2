import { Button } from '@/components/ui/button'
import { retryRefusedSave, skipRefusedSave } from '../_utils/refused-save'

/** The student's choice for an answer the server refused to save. */
export function SaveFailedActions() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={skipRefusedSave}>
        Continue without it
      </Button>
      <Button autoFocus onClick={retryRefusedSave}>
        Try again
      </Button>
    </div>
  )
}
