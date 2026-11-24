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

export type DialogParam = 'new' | 'edit'

export type TabKey = 'sittings' | 'codes' | 'attempts'

export function parseTab(value: string | string[] | null | undefined): TabKey {
  return value === 'sittings' || value === 'attempts' ? value : 'codes'
}

/** `getAll(key)` in the server's `string | string[] | undefined` shape: a repeated key is an array. */
function readRaw(sp: Pick<URLSearchParams, 'getAll'>, key: string): string | string[] | undefined {
  const values = sp.getAll(key)
  return values.length > 1 ? values : values[0]
}

/** Client-side tab read; a repeated `tab` param resolves exactly as the server's `parseTab`. */
export function readTabParam(sp: Pick<URLSearchParams, 'getAll'>): TabKey {
  return parseTab(readRaw(sp, 'tab'))
}

function parseDlg(value: string | string[] | undefined): DialogParam | undefined {
  return value === 'new' || value === 'edit' ? value : undefined
}

/** Client-side dialog read; a repeated or unknown `dlg` resolves exactly as the server's `parseDlg`. */
export function readDlgParam(sp: Pick<URLSearchParams, 'getAll'>): DialogParam | null {
  return parseDlg(readRaw(sp, 'dlg')) ?? null
}

export type InternalExamsSearchParams = {
  tab: TabKey
  status: ListCodesFilters['status']
  codesPage: number
  attemptsPage: number
  sittingsPage: number
  scope: SittingScope
  dlg: DialogParam | undefined
}

/**
 * Normalizes the admin Internal Exams page's raw search params: the active tab (default codes),
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
  }
}
