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
  it('backToQuizzes replaces to the picker, leaves the runner-exit state alone and keeps the flag', () => {
    markTakenOver('s1')
    const replace = vi.fn()
    backToQuizzes(replace)
    expect(replace).toHaveBeenCalledWith('/app/quiz')
    expect(isRunnerExiting()).toBe(false)
    expect(isTakenOver('s1')).toBe(true)
  })

  it('continueHere reloads without touching the runner-exit state', () => {
    continueHere()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(isRunnerExiting()).toBe(false)
  })
})
