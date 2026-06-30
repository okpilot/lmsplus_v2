import { parsePageParam } from '@/lib/utils/parse-page-param'
import type { ListCodesFilters } from './types'

const CODE_STATUS_VALUES = ['active', 'consumed', 'expired', 'voided', 'finished'] as const

function parseCodeStatus(value: string | string[] | undefined): ListCodesFilters['status'] {
  return typeof value === 'string' && (CODE_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as ListCodesFilters['status'])
    : undefined
}

export type InternalExamsSearchParams = {
  status: ListCodesFilters['status']
  codesPage: number
  attemptsPage: number
}

/**
 * Normalizes the admin Internal Exams page's raw search params: a whitelisted code status
 * (invalid/absent → undefined) and the two independent table page numbers. Extracted so
 * `page.tsx` stays composition-only.
 */
export function parseInternalExamsSearchParams(
  sp: Record<string, string | string[] | undefined>,
): InternalExamsSearchParams {
  return {
    status: parseCodeStatus(sp.status),
    codesPage: parsePageParam(sp.codesPage),
    attemptsPage: parsePageParam(sp.attemptsPage),
  }
}
