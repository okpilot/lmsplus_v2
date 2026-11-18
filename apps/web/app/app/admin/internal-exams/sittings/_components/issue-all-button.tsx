'use client'

import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

/** Opens the Issue popup for the whole sitting (no selection params). */
export function IssueAllButton({ count }: Readonly<{ count: number }>) {
  const { open, isRefreshing } = useSittingUi()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isRefreshing}
      onClick={(e) => open('issue', e.currentTarget)}
    >
      Issue all codes ({count})
    </Button>
  )
}
