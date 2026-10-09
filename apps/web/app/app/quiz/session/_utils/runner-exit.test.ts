import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRunnerExit,
  isRunnerExiting,
  markRunnerExiting,
  resetRunnerExit,
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
