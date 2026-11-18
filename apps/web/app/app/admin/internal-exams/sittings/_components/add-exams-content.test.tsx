import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getSubjectEligibility: vi.fn(),
  getSameDayPeople: vi.fn(),
  readUserNames: vi.fn(),
  requireAdmin: vi.fn(),
}))
vi.mock('../people-queries', () => ({
  getSubjectEligibility: m.getSubjectEligibility,
  getSameDayPeople: m.getSameDayPeople,
}))
vi.mock('../people-lookup', () => ({ readUserNames: m.readUserNames }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../actions/add-exams', () => ({ addSittingExams: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=exams'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import type { Selection } from '../types'
import { AddExamsContent } from './add-exams-content'
import { DialogShell } from './dialog-shell'

const row = (people: number, over: Record<string, unknown> = {}) => ({
  subjectId: 'a1',
  subjectName: 'Flight Performance',
  subjectShort: 'FPM',
  courseId: 'c1',
  courseName: 'PPL',
  people,
  eligible: people,
  enteredHere: 0,
  passed: 0,
  attemptRunning: 0,
  enteredElsewhere: 0,
  notEnrolled: 0,
  deactivated: 0,
  state: people === 1 ? 'eligible' : null,
  attemptCount: null,
  passedAt: null,
  passedScore: null,
  elsewhereSittingId: null,
  elsewhereAt: null,
  ...over,
})

async function body(selection: Selection) {
  const el = await AddExamsContent({ sittingId: 's1', selection })
  render(
    <SittingUiProvider>
      <DialogShell>{el}</DialogShell>
    </SittingUiProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  m.requireAdmin.mockResolvedValue({ organizationId: 'o1' })
  m.getSubjectEligibility.mockResolvedValue([row(2)])
  m.getSameDayPeople.mockResolvedValue([])
  m.readUserNames.mockResolvedValue(new Map([['u1', 'Ann Student']]))
})

describe('AddExamsContent', () => {
  it('empty selection: no valid people message with Close, no queries (AC 35)', async () => {
    await body({ kind: 'empty' })
    expect(screen.getByText('No valid people to add exams for.')).toBeInTheDocument()
    expect(m.getSubjectEligibility).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Add exams' })).toBeNull()
  })

  it('one person: titled with the name, eligibility asked for that id (AC 36)', async () => {
    m.getSubjectEligibility.mockResolvedValue([row(1)])
    await body({ kind: 'ids', ids: ['u1'], truncated: false })
    expect(screen.getByRole('heading', { name: 'Add exams for Ann Student' })).toBeInTheDocument()
    expect(m.getSubjectEligibility).toHaveBeenCalledWith('s1', ['u1'])
    expect(m.getSameDayPeople).toHaveBeenCalledWith('s1', ['u1'])
    expect(m.readUserNames).toHaveBeenCalledWith('o1', ['u1'])
  })

  it('a deactivated single person: Deactivated prefix and Add disabled (AC 36)', async () => {
    m.getSubjectEligibility.mockResolvedValue([
      row(1, { eligible: 0, deactivated: 1, state: 'deactivated' }),
    ])
    await body({ kind: 'ids', ids: ['u1'], truncated: false })
    expect(screen.getByText(/^Deactivated\. Pick exams/)).toBeInTheDocument()
    expect(screen.getByText('Deactivated students cannot be entered.')).toBeInTheDocument()
  })

  it('several people: counts in the title, no name lookup', async () => {
    await body({ kind: 'ids', ids: ['u1', 'u2', 'u3'], truncated: false })
    expect(screen.getByRole('heading', { name: 'Add exams for 3 people' })).toBeInTheDocument()
    expect(m.readUserNames).not.toHaveBeenCalled()
  })

  it('all-mode: asks with no ids and titles with every person (AC 41)', async () => {
    m.getSubjectEligibility.mockResolvedValue([row(7)])
    await body({ kind: 'all' })
    expect(m.getSubjectEligibility).toHaveBeenCalledWith('s1', undefined)
    expect(screen.getByRole('heading', { name: 'Add exams for all 7 people' })).toBeInTheDocument()
  })

  it('notes that only the first 100 people were used (AC 35)', async () => {
    await body({ kind: 'ids', ids: ['u1', 'u2'], truncated: true })
    expect(screen.getByText(/Only the first 100 people were used\./)).toBeInTheDocument()
  })

  it('same-day people produce the warning line (AC 40)', async () => {
    m.getSameDayPeople.mockResolvedValue([
      { userId: 'u1', name: 'Ann', sittingId: 'x', scheduledAt: '2026-11-18T09:30:00Z' },
    ])
    await body({ kind: 'ids', ids: ['u1', 'u2'], truncated: false })
    expect(screen.getByText('Ann is also in a sitting today (09:30 UTC).')).toBeInTheDocument()
  })

  it('ended sitting: message and Close only (AC 60)', async () => {
    m.getSubjectEligibility.mockResolvedValue({ ended: true })
    await body({ kind: 'ids', ids: ['u1'], truncated: false })
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add exams' })).toBeNull()
  })

  it('ended on the same-day read also ends the popup (AC 60)', async () => {
    m.getSameDayPeople.mockResolvedValue({ ended: true })
    await body({ kind: 'all' })
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
  })

  it('all-mode with nobody in the sitting shows the empty message', async () => {
    m.getSubjectEligibility.mockResolvedValue([row(0)])
    await body({ kind: 'all' })
    expect(screen.getByText('No valid people to add exams for.')).toBeInTheDocument()
  })

  it('no exams set up: says so instead of an empty list', async () => {
    m.getSubjectEligibility.mockResolvedValue([])
    await body({ kind: 'all' })
    expect(screen.getByText('No exams to add.')).toBeInTheDocument()
  })
})
