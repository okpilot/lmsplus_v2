'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useUpdateSearchParams } from '../_hooks/use-update-search-params'

type Props = {
  page: number
  totalCount: number
  pageSize: number
  entityLabel?: string
}

export function PaginationBar({
  page,
  totalCount,
  pageSize,
  entityLabel = 'questions',
}: Readonly<Props>) {
  const updateParams = useUpdateSearchParams()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const goToPage = useCallback(
    (p: number) => {
      updateParams({ page: p <= 1 ? null : String(p) })
    },
    [updateParams],
  )

  if (totalCount === 0 || totalPages <= 1) return null

  const items = buildPageItems(page, totalPages)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">
        Showing {from}–{to} of {totalCount} {entityLabel}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {items.map((item) =>
          item.type === 'ellipsis' ? (
            <span key={item.key} className="px-1.5 text-xs text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={item.page}
              variant={item.page === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-8"
              onClick={() => goToPage(item.page)}
            >
              {item.page}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

type PageItem = { type: 'page'; page: number } | { type: 'ellipsis'; key: string }

export function buildPageItems(current: number, total: number): PageItem[] {
  const numbers = buildPageNumbers(current, total)
  let ellipsisCount = 0
  return numbers.map((n) => {
    if (n === '...') {
      ellipsisCount++
      return { type: 'ellipsis' as const, key: `ellipsis-${ellipsisCount}` }
    }
    return { type: 'page' as const, page: n }
  })
}

export function buildPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 4) pages.push('...')

  const start = Math.max(2, current - 2)
  const end = Math.min(total - 1, current + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 3) pages.push('...')

  pages.push(total)
  return pages
}
