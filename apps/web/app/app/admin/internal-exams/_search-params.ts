import { z } from 'zod'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { readScopeParam } from './sittings/_utils/scope-url'
import type { SittingScope } from './sittings/types'
import type { ListCodesFilters } from './types'

const CODE_STATUS_VALUES = ['active', 'consumed', 'expired', 'voided', 'finished'] as const

function parseCodeStatus(value: string | string[] | undefined): ListCodesFilters['status'] {
  return typeof value === 'string' && (CODE_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as ListCodesFilters['status'])
    : undefined
}

export type DialogParam = 'new' | 'edit' | 'people' | 'exams' | 'issue'

/** Every URL param a sitting popup owns; opening or closing a popup drops the stale ones. */
export const POPUP_PARAMS = [
  'dlg',
  'ids',
  'all',
  'pq',
  'pgroup',
  'pcourse',
  'pstatus',
  'ppage',
] as const

export type TabKey = 'sittings' | 'codes' | 'attempts'

export function parseTab(value: string | string[] | null | undefined): TabKey {
  return value === 'codes' || value === 'attempts' ? value : 'sittings'
}

function parseDlg(value: string | string[] | undefined): DialogParam | undefined {
  return value === 'new' || value === 'edit' ? value : undefined
}

const SEARCH_MAX = 200

function parseSearch(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim().slice(0, SEARCH_MAX).trim() || undefined
}

function parseId(value: unknown): string | undefined {
  const parsed = z.uuid().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export type InternalExamsSearchParams = {
  tab: TabKey
  status: ListCodesFilters['status']
  codesPage: number
  attemptsPage: number
  sittingsPage: number
  scope: SittingScope
  dlg: DialogParam | undefined
  q: string | undefined
  subject: string | undefined
  sitting: string | undefined
  group: string | undefined
}

/**
 * Normalizes the admin Internal Exams page's raw search params: the active tab (default sittings),
 * a whitelisted code status (invalid/absent → undefined), the sittings scope and the table page
 * numbers. Extracted so `page.tsx` stays composition-only.
 */
export function parseInternalExamsSearchParams(
  sp: Record<string, string | string[] | undefined>,
): InternalExamsSearchParams {
  return {
    tab: parseTab(sp.tab),
    status: parseCodeStatus(sp.status),
    codesPage: parsePageParam(sp.codesPage),
    attemptsPage: parsePageParam(sp.attemptsPage),
    sittingsPage: parsePageParam(sp.page),
    scope: readScopeParam(sp.scope),
    dlg: parseDlg(sp.dlg),
    q: parseSearch(sp.q),
    subject: parseId(sp.subject),
    sitting: parseId(sp.sitting),
    group: parseId(sp.group),
  }
}
