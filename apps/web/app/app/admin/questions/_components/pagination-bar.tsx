'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  page: number
  totalCount: number
  pageSize: number
}

export function PaginationBar({ page, totalCount, pageSize }: Readonly<Props>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const goToPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (p <= 1) {
        params.delete('page')
      } else {
        params.set('page', String(p))
      }
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  if (totalCount === 0 || totalPages <= 1) return null

  const clampedPage = Math.min(page, totalPages)
  const items = buildPageItems(clampedPage, totalPages)
  const from = (clampedPage - 1) * pageSize + 1
  const to = Math.min(clampedPage * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">
        Showing {from}–{to} of {totalCount} questions
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={clampedPage <= 1}
          onClick={() => goToPage(clampedPage - 1)}
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
              variant={item.page === clampedPage ? 'default' : 'outline'}
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
          disabled={clampedPage >= totalPages}
          onClick={() => goToPage(clampedPage + 1)}
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
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)
  return pages
}
