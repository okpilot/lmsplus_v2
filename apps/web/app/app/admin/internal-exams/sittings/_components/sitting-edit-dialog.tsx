'use client'

import { useSittingUi } from '../_hooks/sitting-ui-context'
import type { InvigilatorOption, SittingRow } from '../types'
import { SittingFormDialog } from './sitting-form-dialog'

type Props = { sitting: SittingRow; invigilators: InvigilatorOption[]; editable: boolean }

/** Mounts the Edit popup while `?dlg=edit` is in the URL and the sitting can still be edited. */
export function SittingEditDialog({ sitting, invigilators, editable }: Readonly<Props>) {
  const { dlg } = useSittingUi()
  if (dlg !== 'edit' || !editable) return null
  return <SittingFormDialog mode="edit" sitting={sitting} invigilators={invigilators} />
}
