'use client'

import { useSittingUi } from '../_hooks/sitting-ui-context'
import type { InvigilatorOption } from '../types'
import { SittingFormDialog } from './sitting-form-dialog'

/** Mounts the New popup while `?dlg=new` is in the client URL; Back to a cached server render must not reopen it. */
export function SittingNewDialog({
  invigilators,
}: Readonly<{ invigilators: InvigilatorOption[] }>) {
  const { dlg } = useSittingUi()
  if (dlg !== 'new') return null
  return <SittingFormDialog mode="new" invigilators={invigilators} />
}
