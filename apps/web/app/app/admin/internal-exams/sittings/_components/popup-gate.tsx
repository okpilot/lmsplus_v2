'use client'

import type { ReactNode } from 'react'
import type { DialogParam } from '../../_search-params'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'

type Props = { name: DialogParam; children: ReactNode }

/** Mounts the popup while the CLIENT `?dlg=` names it; Back to a cached server render must not reopen it. */
export function PopupGate({ name, children }: Readonly<Props>) {
  const { dlg } = useSittingUi()
  if (dlg !== name) return null
  return <DialogShell>{children}</DialogShell>
}
