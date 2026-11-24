'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { RowMenu } from '@/components/admin/row-menu'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuSeparator } from '@/components/ui/menu'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { SITTING_BASE, type SittingRow, type SittingSummary } from '../types'
import { type Confirm, LifecycleConfirms } from './lifecycle-confirms'

type Props = { sitting: SittingRow; summary: SittingSummary; notDue: boolean; dayEnded: boolean }

export function SittingLifecycleButtons({ sitting, summary, notDue, dayEnded }: Readonly<Props>) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, isRefreshing } = useSittingUi()
  if (dayEnded || sitting.status === 'closed' || sitting.status === 'cancelled') return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RowMenu label="More actions" triggerRef={triggerRef}>
        <MenuItem disabled={isRefreshing} onClick={() => open('edit', triggerRef.current)}>
          Edit details
        </MenuItem>
        <MenuItem render={<Link href={`${SITTING_BASE}/${sitting.id}/print`} prefetch={false} />}>
          Print codes
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" onClick={() => setConfirm('cancel')}>
          Cancel sitting
        </MenuItem>
      </RowMenu>
      {sitting.status === 'scheduled' && (
        <Button disabled={notDue} onClick={() => setConfirm('start')}>
          Start sitting
        </Button>
      )}
      {sitting.status === 'open' && (
        <Button onClick={() => setConfirm('close')}>Close sitting</Button>
      )}
      <LifecycleConfirms
        sitting={sitting}
        summary={summary}
        confirm={confirm}
        setConfirm={setConfirm}
      />
    </div>
  )
}
