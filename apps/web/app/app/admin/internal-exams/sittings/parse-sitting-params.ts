import { z } from 'zod'
import { SHOW_VALUES, type ShowValue } from './types'

/** Most people a bulk action may tick. */
export const MAX_TICKS = 100

const IDS_MAX_LENGTH = 8192

export type PopupDlg = 'people' | 'exams' | 'issue'

/** `ids` / `all` of a popup URL; `present` is true whenever either param was sent, valid or not. */
export type SelectionParams = {
  present: boolean
  all: boolean
  ids: string[]
  truncated: boolean
}

export type PeopleFilters = {
  q?: string
  group?: string
  course?: string
  status?: 'active' | 'inactive'
  page: number
}

export type SittingParams = {
  q?: string
  show: ShowValue
  page: number
  dlg?: PopupDlg
  selection: SelectionParams
  people: PeopleFilters
}

type Raw = Record<string, string | string[] | undefined>

const QuerySchema = z.string().trim().min(1).max(100)
const PageSchema = z.string().regex(/^[1-9]\d{0,6}$/)
const ShowSchema = z.enum(SHOW_VALUES as [ShowValue, ...ShowValue[]])
const DlgSchema = z.enum(['people', 'exams', 'issue'])
const UuidSchema = z.uuid()
const StatusSchema = z.enum(['active', 'inactive'])

function parseSelection(raw: Raw): SelectionParams {
  const all = raw.all === '1'
  const idsRaw = raw.ids
  const present = raw.all !== undefined || idsRaw !== undefined
  if (all || typeof idsRaw !== 'string' || idsRaw.length > IDS_MAX_LENGTH) {
    return { present, all, ids: [], truncated: false }
  }
  const valid = new Set<string>()
  for (const part of idsRaw.split(',')) {
    const id = UuidSchema.safeParse(part)
    if (id.success) valid.add(id.data.toLowerCase())
  }
  const ids = [...valid]
  return { present, all, ids: ids.slice(0, MAX_TICKS), truncated: ids.length > MAX_TICKS }
}

function parsePeople(raw: Raw): PeopleFilters {
  const q = QuerySchema.safeParse(raw.pq)
  const group = UuidSchema.safeParse(raw.pgroup)
  const course = UuidSchema.safeParse(raw.pcourse)
  const status = StatusSchema.safeParse(raw.pstatus)
  const page = PageSchema.safeParse(raw.ppage)
  return {
    ...(q.success ? { q: q.data } : {}),
    ...(group.success ? { group: group.data } : {}),
    ...(course.success ? { course: course.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    page: page.success ? Number(page.data) : 1,
  }
}

/** URL params of the sitting page; an invalid or repeated value is ignored. */
export function parseSittingParams(raw: Raw): SittingParams {
  const q = QuerySchema.safeParse(raw.q)
  const page = PageSchema.safeParse(raw.page)
  const show = ShowSchema.safeParse(raw.show)
  const dlg = DlgSchema.safeParse(raw.dlg)
  return {
    ...(q.success ? { q: q.data } : {}),
    show: show.success ? show.data : 'all',
    page: page.success ? Number(page.data) : 1,
    ...(dlg.success ? { dlg: dlg.data } : {}),
    selection: parseSelection(raw),
    people: parsePeople(raw),
  }
}
