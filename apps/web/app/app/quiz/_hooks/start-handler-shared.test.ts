import { describe, expect, it, vi } from 'vitest'
import { confirmStartOverwrite, failStart } from './start-handler-shared'

// ---- failStart -------------------------------------------------------------

describe('failStart', () => {
  it('surfaces the message and stops the loading indicator', () => {
    const setLoading = vi.fn()
    const setError = vi.fn()
    failStart({ setLoading, setError, inFlight: { current: true } }, 'Nothing available')
    expect(setError).toHaveBeenCalledWith('Nothing available')
    expect(setLoading).toHaveBeenCalledWith(false)
  })

  it('lets the user try again after a failure', () => {
    const inFlight = { current: true }
    failStart({ setLoading: vi.fn(), setError: vi.fn(), inFlight }, 'Nothing available')
    expect(inFlight.current).toBe(false)
  })
})

// ---- confirmStartOverwrite ---------------------------------------------------

describe('confirmStartOverwrite', () => {
  it('proceeds without prompting when there is no unfinished session', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    expect(confirmStartOverwrite(null, 'a new quiz')).toBe(true)
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('names the unfinished session subject and the new activity in the prompt', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    expect(confirmStartOverwrite({ subjectName: 'Meteorology' }, 'an exam')).toBe(true)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('(Meteorology)'))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('an exam'))
    confirmSpy.mockRestore()
  })

  it('omits the subject suffix when the unfinished session has no subject name', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    confirmStartOverwrite({}, 'a new quiz')
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0]?.[0]).not.toMatch(/\(/)
    confirmSpy.mockRestore()
  })

  it('blocks the start when the user declines the prompt', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    expect(confirmStartOverwrite({ subjectName: 'Air Law' }, 'a new quiz')).toBe(false)
    confirmSpy.mockRestore()
  })
})
