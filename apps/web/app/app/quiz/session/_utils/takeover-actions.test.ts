import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetRunnerExit, isRunnerExiting } from './runner-exit'
import { _resetSessionTakeover, isTakenOver, markTakenOver } from './session-takeover'
import { backToQuizzes, continueHere } from './takeover-actions'

const reload = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  _resetRunnerExit()
  _resetSessionTakeover()
  vi.stubGlobal('location', { ...window.location, reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('takeover actions', () => {
  it('backToQuizzes clears the flag and replaces to the picker with the guards released', () => {
    markTakenOver('s1')
    let exiting: boolean | undefined
    const replace = vi.fn(() => {
      exiting = isRunnerExiting()
    })
    backToQuizzes('s1', replace)
    expect(replace).toHaveBeenCalledWith('/app/quiz')
    expect(exiting).toBe(true)
    expect(isTakenOver('s1')).toBe(false)
  })

  it('continueHere releases the guards then reloads', () => {
    let exiting: boolean | undefined
    reload.mockImplementation(() => {
      exiting = isRunnerExiting()
    })
    continueHere()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(exiting).toBe(true)
  })
})
