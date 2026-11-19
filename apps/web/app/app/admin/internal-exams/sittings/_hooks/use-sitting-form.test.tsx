import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ persist: vi.fn(), push: vi.fn(), replace: vi.fn(), opened: false }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: m.replace }),
}))
vi.mock('../../notice-queries', () => ({}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('../_utils/sitting-form', async (orig) => ({
  ...(await orig<typeof import('../_utils/sitting-form')>()),
  persist: m.persist,
}))
vi.mock('./sitting-ui-context', () => ({
  useSittingUi: () => ({
    close: vi.fn(),
    setLocked: vi.fn(),
    setBanner: vi.fn(),
    consumeOpenedHere: () => m.opened,
  }),
}))

import { dropDialogParam, useSittingForm } from './use-sitting-form'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'

beforeEach(() => {
  vi.resetAllMocks()
  m.opened = false
  window.history.replaceState(null, '', '/app/admin/internal-exams?tab=sittings&dlg=new')
})

async function create() {
  const { result } = renderHook(() => useSittingForm(undefined))
  act(() => result.current.fields.setInvigilatorId(INV))
  act(() => result.current.submit())
  await waitFor(() => expect(result.current.created).toBe(true))
}

describe('useSittingForm create path', () => {
  it('replaces the dialog entry when opened in this session', async () => {
    m.opened = true
    m.persist.mockResolvedValue({ id: SID })
    await create()
    expect(m.replace).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
    expect(m.push).not.toHaveBeenCalled()
  })

  it('strips dlg then pushes for a deep link', async () => {
    m.persist.mockResolvedValue({ id: SID })
    await create()
    expect(m.push).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
    expect(m.replace).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?tab=sittings')
  })

  it('shows a service error when persist throws', async () => {
    m.persist.mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useSittingForm(undefined))
    act(() => result.current.fields.setInvigilatorId(INV))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.error).toBe('Service error. Please try again.'))
    expect(result.current.created).toBe(false)
  })
})

describe('dropDialogParam', () => {
  it('removes only dlg from the URL', () => {
    dropDialogParam()
    expect(window.location.search).toBe('?tab=sittings')
  })
})
