import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  issue: vi.fn(),
  remove: vi.fn(),
  voidCode: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: m.issue }))
vi.mock('../actions/remove-entries', () => ({ removeSittingEntries: m.remove }))
vi.mock('../actions/void-sitting-code', () => ({ voidSittingCode: m.voidCode }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { ExamRowMenu } from './exam-row-menu'

const entry = (over: Record<string, unknown> = {}) => ({
  entryId: 'e1',
  subjectId: 's1',
  subjectShort: 'FPM',
  subjectName: 'Flight Performance',
  courseId: 'c1',
  courseName: 'PPL',
  status: 'ready',
  attemptNumber: null,
  passed: null,
  score: null,
  codeId: 'k1',
  code: 'ABCD1234',
  codeExpiresAt: '2026-11-18T23:59:00Z',
  codeEmailedAt: null,
  voidReason: null,
  sessionId: null,
  sessionStartedAt: null,
  ...over,
})

function ui(over: Record<string, unknown> = {}, entryOver: Record<string, unknown> = {}) {
  return render(
    <SittingUiProvider>
      <ExamRowMenu
        sittingId="sit-1"
        personName="Ann Student"
        deactivated={false}
        editable
        entry={entry(entryOver) as never}
        {...(over as object)}
      />
    </SittingUiProvider>,
  )
}

const TRIGGER = 'Actions for FPM, Ann Student'

async function items(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: TRIGGER }))
  return (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
}

beforeEach(() => vi.resetAllMocks())

describe('ExamRowMenu items', () => {
  it('offers Void code and Remove exam for a live code, and no Email items', async () => {
    ui()
    expect(await items(userEvent.setup())).toEqual(['Void code', 'Remove exam'])
  })

  it('offers Issue code and Remove exam for an exam without a code', async () => {
    ui({}, { status: 'no_code', code: null, codeId: null })
    expect(await items(userEvent.setup())).toEqual(['Issue code', 'Remove exam'])
  })

  it('offers Re-issue for an expired code', async () => {
    ui({}, { status: 'expired', code: null })
    expect(await items(userEvent.setup())).toEqual(['Re-issue', 'Remove exam'])
  })

  it('offers Issue new code for a voided code', async () => {
    ui({}, { status: 'voided', code: null })
    expect(await items(userEvent.setup())).toEqual(['Issue new code', 'Remove exam'])
  })

  it.each(['finished', 'voided_attempt'])(
    'offers only View attempt for a %s exam (no Remove exam, no Void code)',
    async (status) => {
      ui({}, { status, sessionId: 'sess-1' })
      const user = userEvent.setup()
      expect(await items(user)).toEqual(['View attempt'])
      expect(screen.getByRole('menuitem', { name: 'View attempt' }).closest('a')).toHaveAttribute(
        'href',
        '/app/admin/internal-exams/report?session=sess-1',
      )
    },
  )

  it('hides Issue-type steps for a deactivated person but keeps Remove exam', async () => {
    ui({ deactivated: true }, { status: 'no_code', code: null })
    expect(await items(userEvent.setup())).toEqual(['Remove exam'])
  })

  it('offers View attempt only when the sitting is not editable', async () => {
    ui({ editable: false }, { status: 'finished', sessionId: 'sess-1' })
    expect(await items(userEvent.setup())).toEqual(['View attempt'])
  })

  it.each(['ready', 'no_code', 'absent'])(
    'renders no menu when not editable and exam is %s',
    (status) => {
      ui({ editable: false }, { status })
      expect(screen.queryByRole('button', { name: TRIGGER })).toBeNull()
    },
  )

  it('renders no menu for a running exam', () => {
    ui({}, { status: 'running', sessionId: 'sess-1' })
    expect(screen.queryByRole('button', { name: TRIGGER })).toBeNull()
  })

  it('renders no menu for a discarded attempt', () => {
    ui({}, { status: 'discarded', code: null })
    expect(screen.queryByRole('button', { name: TRIGGER })).toBeNull()
  })
})

describe('ExamRowMenu single-entry issue', () => {
  it('issues for this entry only and toasts Code issued.', async () => {
    m.issue.mockResolvedValue({ success: true, issued: 1, reissuedAfterExpiry: 0 })
    ui({}, { status: 'no_code', code: null })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await user.click(await screen.findByRole('menuitem', { name: 'Issue code' }))
    await waitFor(() =>
      expect(m.issue).toHaveBeenCalledWith({ sittingId: 'sit-1', entryIds: ['e1'] }),
    )
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalledWith('Code issued.', undefined))
  })

  it('toasts Code re-issued. after an expiry re-issue', async () => {
    m.issue.mockResolvedValue({ success: true, issued: 0, reissuedAfterExpiry: 1 })
    ui({}, { status: 'expired', code: null })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await user.click(await screen.findByRole('menuitem', { name: 'Re-issue' }))
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalledWith('Code re-issued.', undefined))
  })
})

describe('ExamRowMenu Remove exam', () => {
  async function openRemove() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove exam' }))
    return { user, dialog: await screen.findByRole('alertdialog') }
  }

  it('confirms with the spec copy', async () => {
    ui()
    const { dialog } = await openRemove()
    expect(within(dialog).getByText(/^Remove .+ for Ann Student\?$/)).toBeInTheDocument()
    expect(within(dialog).getByText('Its unused code is voided.')).toBeInTheDocument()
  })

  it('removes the entry on confirm', async () => {
    m.remove.mockResolvedValue({ success: true, removed: 1, codesVoided: 1 })
    ui()
    const { user, dialog } = await openRemove()
    await user.click(within(dialog).getByRole('button', { name: 'Remove exam' }))
    await waitFor(() =>
      expect(m.remove).toHaveBeenCalledWith({ sittingId: 'sit-1', entryIds: ['e1'] }),
    )
  })

  it('shows the entry_has_attempt message in the dialog and keeps it open', async () => {
    m.remove.mockResolvedValue({
      success: false,
      error: 'This exam has been taken. It cannot be removed.',
    })
    ui()
    const { user, dialog } = await openRemove()
    await user.click(within(dialog).getByRole('button', { name: 'Remove exam' }))
    expect(
      await within(dialog).findByText('This exam has been taken. It cannot be removed.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})

describe('ExamRowMenu Void code', () => {
  async function openVoid() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await user.click(await screen.findByRole('menuitem', { name: 'Void code' }))
    return { user, dialog: await screen.findByRole('dialog') }
  }

  it('titles the dialog with the exam and person', async () => {
    ui()
    const { dialog } = await openVoid()
    expect(within(dialog).getByText('Void code for FPM, Ann Student?')).toBeInTheDocument()
  })

  it('requires a reason before voiding', async () => {
    ui()
    const { user, dialog } = await openVoid()
    await user.click(within(dialog).getByRole('button', { name: /^Void code$/ }))
    expect(m.voidCode).not.toHaveBeenCalled()
  })

  it('voids with the entered reason', async () => {
    m.voidCode.mockResolvedValue({
      success: true,
      codeId: 'k1',
    })
    ui()
    const { user, dialog } = await openVoid()
    await user.type(within(dialog).getByRole('textbox'), 'Wrong person')
    await user.click(within(dialog).getByRole('button', { name: /^Void code$/ }))
    await waitFor(() =>
      expect(m.voidCode).toHaveBeenCalledWith({
        sittingId: 'sit-1',
        codeId: 'k1',
        reason: 'Wrong person',
      }),
    )
  })

  it('says the student was emailed when the code was emailed', async () => {
    ui({}, { codeEmailedAt: '2026-11-18T08:00:00Z' })
    const { dialog } = await openVoid()
    expect(within(dialog).getByText('The student was emailed this code.')).toBeInTheDocument()
  })

  it('does not say so when the code was not emailed', async () => {
    ui()
    const { dialog } = await openVoid()
    expect(within(dialog).queryByText('The student was emailed this code.')).toBeNull()
  })
})
