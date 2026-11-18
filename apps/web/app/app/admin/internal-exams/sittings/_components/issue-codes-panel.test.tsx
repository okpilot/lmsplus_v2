import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ issue: vi.fn(), replace: vi.fn(), success: vi.fn() }))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: m.issue }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=issue'),
}))
vi.mock('sonner', () => ({ toast: { success: m.success, error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'
import { IssueCodesPanel } from './issue-codes-panel'
import { ResultBanner } from './result-banner'

const preview = (over: Record<string, unknown> = {}) => ({
  counts: { issue: 3, reissue_after_expiry: 1 },
  studentsToIssue: 2,
  details: [],
  ...over,
})
const counts = (over: Record<string, number> = {}) => ({
  success: true,
  issued: 3,
  reissuedAfterExpiry: 1,
  skippedAlreadyIssued: 0,
  skippedAttemptTaken: 0,
  skippedDeactivated: 0,
  skippedNoConfig: 0,
  skippedNotEnrolled: 0,
  skippedPassed: 0,
  ...over,
})

function Probe() {
  return <p data-testid="probe">{useSittingUi().locked ? 'locked' : 'free'}</p>
}

function panel(p: Record<string, unknown> = {}, userIds?: string[]) {
  render(
    <SittingUiProvider>
      <Probe />
      <ResultBanner />
      <DialogShell>
        <IssueCodesPanel sittingId="s1" userIds={userIds} preview={preview(p) as never} />
      </DialogShell>
    </SittingUiProvider>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('IssueCodesPanel', () => {
  it('states what will be issued, counting re-issues (AC 42)', () => {
    panel()
    expect(screen.getByText('Will issue 4 codes for 2 students.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue 4 codes' })).toBeInTheDocument()
  })

  it('shows already-issued as a plain line', () => {
    panel({ counts: { issue: 1, already_issued: 5 } })
    expect(screen.getByText('5 exams already have a code.')).toBeInTheDocument()
  })

  it('groups skipped exams by reason with counts and lists the details (AC 42)', () => {
    panel({
      counts: { issue: 1, passed: 2, exam_disabled: 1 },
      details: [
        { entryId: 'e1', student: 'Ann', subjectShort: 'FPM', reason: 'passed' },
        { entryId: 'e2', student: 'Bob', subjectShort: 'NAV', reason: 'exam_disabled' },
      ],
    })
    expect(screen.getByText('2 exams: already passed')).toBeInTheDocument()
    expect(screen.getByText('1 exam: exam disabled')).toBeInTheDocument()
    expect(screen.getByText('Ann · FPM — already passed')).toBeInTheDocument()
    expect(screen.getByText('Bob · NAV — exam disabled')).toBeInTheDocument()
  })

  it('counts every skipped exam and says when only the first ones are listed', () => {
    const details = Array.from({ length: 200 }, (_, i) => ({
      entryId: `e${i}`,
      student: `S${i}`,
      subjectShort: 'NAV',
      reason: 'passed',
    }))
    panel({ counts: { issue: 1, passed: 350 }, details })
    expect(screen.getByText('Show skipped exams (350)')).toBeInTheDocument()
    expect(screen.getByText('The first 200 are listed.')).toBeInTheDocument()
    expect(screen.getAllByText(/ · NAV — already passed$/)).toHaveLength(200)
  })

  it('lists every skipped exam without a first-only note when none are cut', () => {
    panel({
      counts: { issue: 1, passed: 1 },
      details: [{ entryId: 'e1', student: 'Ann', subjectShort: 'FPM', reason: 'passed' }],
    })
    expect(screen.getByText('Show skipped exams (1)')).toBeInTheDocument()
    expect(screen.queryByText(/are listed\./)).not.toBeInTheDocument()
  })

  it('Nothing to issue: Close only, no Issue button (AC 42)', () => {
    panel({ counts: { already_issued: 2 } })
    expect(screen.getByText('Nothing to issue.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Issue/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })

  it('submits the explicit ids, closes and reports the result (AC 43)', async () => {
    m.issue.mockResolvedValue(counts())
    panel({}, ['u1', 'u2'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue 4 codes' }))
    expect(m.issue).toHaveBeenCalledWith({ sittingId: 's1', userIds: ['u1', 'u2'] })
    await waitFor(() => expect(m.replace).toHaveBeenCalled())
    expect(m.success).toHaveBeenCalledWith('Issued 3 codes.', expect.anything())
  })

  it('sends no userIds for the whole sitting (AC 43)', async () => {
    m.issue.mockResolvedValue(counts({ issued: 4 }))
    panel()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue 4 codes' }))
    expect(m.issue).toHaveBeenCalledWith({ sittingId: 's1' })
  })

  it('a changed count since the preview is noted in the banner detail (AC 43)', async () => {
    m.issue.mockResolvedValue(counts({ issued: 2, reissuedAfterExpiry: 0, skippedPassed: 1 }))
    panel()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue 4 codes' }))
    expect(await screen.findByText(/Counts changed since the preview\./)).toBeInTheDocument()
  })

  it('keeps the popup open on an error and shows it inside (AC 47)', async () => {
    m.issue.mockResolvedValue({
      success: false,
      error: 'Could not generate a unique code. Try again.',
    })
    panel()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue 4 codes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not generate')
    expect(m.replace).not.toHaveBeenCalled()
  })

  it('locks the popup while Issue runs (AC 47)', async () => {
    let done: (v: unknown) => void = () => undefined
    m.issue.mockReturnValue(new Promise((r) => (done = r)))
    panel()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue 4 codes' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('locked')
    await act(async () => done(counts()))
    expect(screen.getByTestId('probe')).toHaveTextContent('free')
  })
})
