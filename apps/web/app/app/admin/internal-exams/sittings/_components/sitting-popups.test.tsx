import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ search: '', people: vi.fn(), exams: vi.fn(), issue: vi.fn() }))
vi.mock('./add-people-content', () => ({
  AddPeopleContent: (p: unknown) => {
    m.people(p)
    return <p>people body</p>
  },
}))
vi.mock('./add-exams-content', () => ({
  AddExamsContent: (p: unknown) => {
    m.exams(p)
    return <p>exams body</p>
  },
}))
vi.mock('./issue-codes-content', () => ({
  IssueCodesContent: (p: unknown) => {
    m.issue(p)
    return <p>issue body</p>
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams(m.search),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import type { SittingParams } from '../parse-sitting-params'
import { SittingPopups } from './sitting-popups'

const sitting = { id: 's1', scheduledAt: '2026-11-18T09:30:00Z' }
const FILTERS = { page: 2, q: 'ann' }

const params = (over: Partial<SittingParams> = {}): SittingParams => ({
  show: 'all',
  page: 1,
  selection: { present: false, all: false, ids: [], truncated: false },
  people: { page: 1 },
  ...over,
})

function popups(over: Record<string, unknown> = {}) {
  const props = {
    sitting,
    editable: true,
    params: params({ dlg: 'people', people: FILTERS }),
    selection: { kind: 'empty' },
    ...over,
  }
  return render(
    <SittingUiProvider>
      <SittingPopups {...(props as unknown as Parameters<typeof SittingPopups>[0])} />
    </SittingUiProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  m.search = 'dlg=people'
})

describe('SittingPopups', () => {
  it('renders the Add people body with the URL filters while ?dlg=people (AC 31)', () => {
    popups()
    expect(screen.getByText('people body')).toBeInTheDocument()
    expect(m.people).toHaveBeenCalledWith({ sittingId: 's1', filters: FILTERS })
  })

  it('renders the Add exams body with the resolved selection', () => {
    m.search = 'dlg=exams'
    const selection = { kind: 'all' }
    popups({ params: params({ dlg: 'exams' }), selection })
    expect(screen.getByText('exams body')).toBeInTheDocument()
    expect(m.exams).toHaveBeenCalledWith({ sittingId: 's1', selection })
  })

  it('renders the Issue body with the sitting day and selection', () => {
    m.search = 'dlg=issue'
    const selection = { kind: 'whole' }
    popups({ params: params({ dlg: 'issue' }), selection })
    expect(screen.getByText('issue body')).toBeInTheDocument()
    expect(m.issue).toHaveBeenCalledWith({
      sittingId: 's1',
      scheduledAt: sitting.scheduledAt,
      selection,
    })
  })

  it('renders no popup and queries nothing when the sitting is not editable (AC 51)', () => {
    popups({ editable: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(m.people).not.toHaveBeenCalled()
  })

  it('renders nothing without a dlg param', () => {
    popups({ params: params() })
    expect(m.people).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show a popup the client URL no longer names (Back, AC 46)', () => {
    m.search = ''
    popups()
    expect(screen.queryByText('people body')).toBeNull()
  })
})
