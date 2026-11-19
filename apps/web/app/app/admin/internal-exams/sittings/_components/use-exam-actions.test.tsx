import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RosterEntry } from '../types'

const m = vi.hoisted(() => ({
  issue: vi.fn(),
  remove: vi.fn(),
  voidCode: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('../../actions/send-code-email', () => ({ sendInternalExamCodeEmail: vi.fn() }))
vi.mock('../actions/email-sitting-codes', () => ({ emailSittingCodes: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: m.issue }))
vi.mock('../actions/remove-entries', () => ({ removeSittingEntries: m.remove }))
vi.mock('../actions/void-sitting-code', () => ({ voidSittingCode: m.voidCode }))

import { useExamActions } from './use-exam-actions'

const entry = { entryId: 'e1', subjectShort: 'FPM' } as unknown as RosterEntry
const counts = {
  issued: 0,
  reissuedAfterExpiry: 0,
  skippedAlreadyIssued: 0,
  skippedAttemptTaken: 0,
  skippedDeactivated: 0,
  skippedNoConfig: 0,
  skippedNotEnrolled: 0,
  skippedPassed: 0,
}

function setup(onDone = vi.fn()) {
  const hook = renderHook(() =>
    useExamActions({
      sittingId: 's1',
      entry,
      personName: 'Ann Student',
      who: 'FPM, Ann Student',
      onDone,
    }),
  )
  return { ...hook, onDone }
}

beforeEach(() => vi.resetAllMocks())

describe('useExamActions', () => {
  it('reports a no-op issue as a failure-toned banner, not a success', async () => {
    m.issue.mockResolvedValue({ success: true, ...counts, skippedAlreadyIssued: 1 })
    const { result } = setup()
    act(() => result.current.issue())
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('No code issued.'))
    expect(m.toastSuccess).not.toHaveBeenCalled()
    expect(m.issue).toHaveBeenCalledWith({ sittingId: 's1', entryIds: ['e1'] })
  })

  it('toasts the issue failure instead of keeping it as dialog error', async () => {
    m.issue.mockResolvedValue({ success: false, error: 'Nope' })
    const { result } = setup()
    act(() => result.current.issue())
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Nope'))
    expect(result.current.error).toBeNull()
  })

  it('voids with the reason, calls onDone and toasts the exam owner', async () => {
    m.voidCode.mockResolvedValue({ success: true, codeId: 'c1' })
    const { result, onDone } = setup()
    act(() => result.current.voidCode('c1', 'lost'))
    await waitFor(() =>
      expect(m.toastSuccess).toHaveBeenCalledWith(
        'Voided the code for FPM, Ann Student.',
        undefined,
      ),
    )
    expect(m.voidCode).toHaveBeenCalledWith({ sittingId: 's1', codeId: 'c1', reason: 'lost' })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps a void failure as the dialog error and does not call onDone', async () => {
    m.voidCode.mockResolvedValue({ success: false, error: 'Already used' })
    const { result, onDone } = setup()
    act(() => result.current.voidCode('c1', 'lost'))
    await waitFor(() => expect(result.current.error).toBe('Already used'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('mentions the voided code only when the removal voided one', async () => {
    m.remove.mockResolvedValue({ success: true, removed: 1, codesVoided: 1 })
    const first = setup()
    act(() => first.result.current.remove())
    await waitFor(() =>
      expect(m.toastSuccess).toHaveBeenCalledWith('Removed FPM for Ann Student.', {
        description: 'Its unused code was voided.',
      }),
    )
    m.toastSuccess.mockClear()
    m.remove.mockResolvedValue({ success: true, removed: 1, codesVoided: 0 })
    const second = setup()
    act(() => second.result.current.remove())
    await waitFor(() =>
      expect(m.toastSuccess).toHaveBeenCalledWith('Removed FPM for Ann Student.', undefined),
    )
    expect(m.remove).toHaveBeenLastCalledWith({ sittingId: 's1', entryIds: ['e1'] })
  })
})
