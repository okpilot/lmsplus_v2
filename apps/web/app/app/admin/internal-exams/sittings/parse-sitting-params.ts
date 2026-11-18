import { z } from 'zod'
import { SHOW_VALUES, type ShowValue } from './types'

/** Most people a bulk action may tick. */
export const MAX_TICKS = 100

export type SittingParams = { q?: string; show: ShowValue; page: number }

type Raw = Record<string, string | string[] | undefined>

const QuerySchema = z.string().trim().min(1).max(100)
const PageSchema = z.string().regex(/^[1-9]\d{0,6}$/)
const ShowSchema = z.enum(SHOW_VALUES as [ShowValue, ...ShowValue[]])

/** URL params of the sitting page; an invalid or repeated value is ignored. */
export function parseSittingParams(raw: Raw): SittingParams {
  const q = QuerySchema.safeParse(raw.q)
  const page = PageSchema.safeParse(raw.page)
  const show = ShowSchema.safeParse(raw.show)
  return {
    ...(q.success ? { q: q.data } : {}),
    show: show.success ? show.data : 'all',
    page: page.success ? Number(page.data) : 1,
  }
}
