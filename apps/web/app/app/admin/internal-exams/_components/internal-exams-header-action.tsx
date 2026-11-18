'use client'

import { Plus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSittingUi } from '../sittings/_hooks/sitting-ui-context'

/** The page's one primary action; shown on the Sittings tab only. */
export function InternalExamsHeaderAction() {
  const tab = useSearchParams().get('tab')
  const { open } = useSittingUi()
  if (tab !== 'sittings') return null
  return (
    <Button onClick={(e) => open('new', e.currentTarget)}>
      <Plus className="size-icon" />
      New sitting
    </Button>
  )
}
