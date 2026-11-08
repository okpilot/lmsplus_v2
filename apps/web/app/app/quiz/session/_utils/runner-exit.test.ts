import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRunnerExit,
  isCurrentRunner,
  isRunnerExiting,
  markRunnerExiting,
  resetRunnerExit,
  runnerToken,
  subscribeRunnerExit,
} from './runner-exit'

beforeEach(() => _resetRunnerExit())

describe('runner exit flag', () => {
  it('starts as not exiting', () => {
    expect(isRunnerExiting()).toBe(false)
  })

  it('reports exiting once marked and clears on reset', () => {
    markRunnerExiting()
    expect(isRunnerExiting()).toBe(true)
    resetRunnerExit()
    expect(isRunnerExiting()).toBe(false)
  })

  it('notifies a subscriber once per change', () => {
    const listener = vi.fn()
    subscribeRunnerExit(listener)
    markRunnerExiting()
    markRunnerExiting()
    expect(listener).toHaveBeenCalledTimes(1)
    resetRunnerExit()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const off = subscribeRunnerExit(listener)
    off()
    markRunnerExiting()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('runner token', () => {
  it('keeps the token current while the runner stays mounted', () => {
    const token = runnerToken()
    expect(isCurrentRunner(token)).toBe(true)
  })

  it('invalidates a token when the runner unmounts', () => {
    const token = runnerToken()
    resetRunnerExit()
    expect(isCurrentRunner(token)).toBe(false)
  })

  it('invalidates a token on reset even when the exit flag was already clear', () => {
    expect(isRunnerExiting()).toBe(false)
    const token = runnerToken()
    resetRunnerExit()
    expect(runnerToken()).not.toBe(token)
  })

  it('treats a token taken after the reset as current', () => {
    resetRunnerExit()
    expect(isCurrentRunner(runnerToken())).toBe(true)
  })

  it('returns the token to its initial value on the test reset', () => {
    const initial = runnerToken()
    resetRunnerExit()
    resetRunnerExit()
    _resetRunnerExit()
    expect(runnerToken()).toBe(initial)
  })
})
