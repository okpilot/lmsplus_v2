import { Button } from '@/components/ui/button'
import type { BulkMode } from '../_hooks/use-bulk-group-action'

type Props = {
  canRun: boolean
  isPending: boolean
  onRun: (mode: BulkMode) => void
  onClear: () => void
}

export function BulkActionButtons({ canRun, isPending, onRun, onClear }: Readonly<Props>) {
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onRun('add')}
        disabled={isPending || !canRun}
      >
        Add to group
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onRun('remove')}
        disabled={isPending || !canRun}
      >
        Remove from group
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={isPending}>
        Clear
      </Button>
    </>
  )
}
