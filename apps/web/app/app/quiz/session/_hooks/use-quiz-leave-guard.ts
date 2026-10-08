import { useState } from 'react'
import { useQuizNavigationGuard } from './use-quiz-navigation-guard'

type Opts = {
  isDiscovery: boolean
  submitted: { current: boolean }
  setShowFinishDialog: (open: boolean) => void
  pendingOptionId: string | null
  existingAnswer: unknown
}

/**
 * Turns Back/Forward into the right confirmation: the Finish dialog for study and exam, a Stay/Leave
 * confirm for discovery. `submitted` is a ref, so the guard disarms on the re-render that closes the
 * Finish dialog after a successful submit.
 */
export function useQuizLeaveGuard({
  isDiscovery,
  submitted,
  setShowFinishDialog,
  pendingOptionId,
  existingAnswer,
}: Readonly<Opts>) {
  const [discoveryConfirmOpen, setDiscoveryConfirmOpen] = useState(false)
  const { release } = useQuizNavigationGuard({
    submitted: submitted.current,
    onAttempt: () => (isDiscovery ? setDiscoveryConfirmOpen(true) : setShowFinishDialog(true)),
  })
  return {
    discoveryConfirmOpen,
    setDiscoveryConfirmOpen,
    release,
    pendingSelection: pendingOptionId !== null && !existingAnswer,
    openExitConfirm: () => setDiscoveryConfirmOpen(true),
  }
}
