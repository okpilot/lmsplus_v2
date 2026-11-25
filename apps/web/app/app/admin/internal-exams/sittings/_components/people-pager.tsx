'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

type Props = { page: number; pages: number; disabled: boolean }

/** Previous / Next for the people list; the page lives in `ppage`. */
export function PeoplePager({ page, pages, disabled }: Readonly<Props>) {
  const { replaceParams } = useSittingUi()
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <span className="flex gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Previous page"
          disabled={page <= 1 || disabled}
          onClick={() => replaceParams({ ppage: page - 1 <= 1 ? null : String(page - 1) })}
        >
          <ChevronLeft className="size-icon" />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Next page"
          disabled={page >= pages || disabled}
          onClick={() => replaceParams({ ppage: String(page + 1) })}
        >
          <ChevronRight className="size-icon" />
        </Button>
      </span>
    </div>
  )
}
