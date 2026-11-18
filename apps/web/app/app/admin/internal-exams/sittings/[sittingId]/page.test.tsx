import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ requireAdmin: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../_utils/load-sitting-page', () => ({ loadSittingPage: m.load }))
vi.mock('../_components/sitting-header', () => ({ SittingHeader: () => null }))
vi.mock('../_components/result-banner', () => ({ ResultBanner: () => null }))
vi.mock('../_components/sitting-popups', () => ({ SittingPopups: () => null }))
vi.mock('../_hooks/sitting-ui-context', () => ({
  SittingUiProvider: ({ children }: { children: unknown }) => children,
}))

import SittingPage from './page'

const SID = '00000000-0000-4000-a000-0000000000a1'
const params = (id: string, sp: Record<string, string> = {}) => ({
  params: Promise.resolve({ sittingId: id }),
  searchParams: Promise.resolve(sp),
})

beforeEach(() => {
  vi.resetAllMocks()
  m.requireAdmin.mockResolvedValue({ supabase: {}, organizationId: 'o', userId: 'a' })
  m.load.mockResolvedValue({
    sitting: { id: SID },
    summary: {
      candidates: 1,
      entries: 2,
      codesIssued: 3,
      dayEnded: false,
      status: 'scheduled',
      entriesIssuable: 0,
      pendingRemovalNotices: 0,
    },
    roster: { rows: [], total: 0 },
    removed: { rows: [], total: 0 },
    invigilators: [],
    notDue: false,
    editable: true,
    selection: { kind: 'empty' },
  })
})

describe('SittingPage', () => {
  it('guards with requireAdmin, then loads by the route id', async () => {
    await SittingPage(params(SID) as never)
    expect(m.requireAdmin).toHaveBeenCalled()
    expect(m.load).toHaveBeenCalledWith(SID, expect.anything())
    const a = m.requireAdmin.mock.invocationCallOrder[0] as number
    const l = m.load.mock.invocationCallOrder[0] as number
    expect(a).toBeLessThan(l)
  })

  it('propagates the loader 404', async () => {
    m.load.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(SittingPage(params('x') as never)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('passes the parsed searchParams to the loader', async () => {
    await SittingPage(params(SID, { q: 'ann', show: 'needs_code', page: '2' }) as never)
    expect(m.load).toHaveBeenCalledWith(
      SID,
      expect.objectContaining({ q: 'ann', show: 'needs_code', page: 2 }),
    )
  })

  it('seeds the provider from the selection the loader resolved (AC 35, 59)', async () => {
    const loaded = await m.load()
    m.load.mockResolvedValue({
      ...loaded,
      selection: { kind: 'ids', ids: ['u1'], truncated: false },
    })
    const el = (await SittingPage(params(SID, { dlg: 'exams', ids: 'u1' }) as never)) as {
      props: { initialSelection: unknown }
    }
    expect(el.props.initialSelection).toEqual({ ids: ['u1'], all: false })
  })

  it('renders the popups with the parsed params, editability and selection (AC 51, 59)', async () => {
    const el = (await SittingPage(params(SID, { dlg: 'people', pq: 'ann' }) as never)) as {
      props: {
        children: { props: { children: { type: unknown; props: Record<string, unknown> }[] } }
      }
    }
    const popups = el.props.children.props.children.find(
      (c) => (c.type as { name?: string }).name === 'SittingPopups',
    )
    expect(popups?.props).toMatchObject({
      sitting: { id: SID },
      editable: true,
      selection: { kind: 'empty' },
      params: { dlg: 'people', people: { q: 'ann', page: 1 } },
    })
  })

  it('is composition only: no filtering, mapping or branching on data', () => {
    const src = readFileSync(`${__dirname}/page.tsx`, 'utf8')
    expect(src).not.toMatch(/\.(filter|map|reduce|sort)\(/)
    expect(src).not.toMatch(/\bif \(/)
  })
})
