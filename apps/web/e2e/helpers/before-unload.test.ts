import type { Dialog, Page } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { acceptBeforeUnload } from './before-unload'

function setup() {
  let handler: ((d: Dialog) => void) | undefined
  const page = {
    on: (_event: string, h: (d: Dialog) => void) => {
      handler = h
    },
  } as unknown as Page
  const count = acceptBeforeUnload(page)
  const fire = (type: string) => {
    const accept = vi.fn().mockResolvedValue(undefined)
    handler?.({ type: () => type, accept } as unknown as Dialog)
    return accept
  }
  return { count, fire }
}

describe('acceptBeforeUnload', () => {
  it('accepts a beforeunload prompt and counts it', () => {
    const { count, fire } = setup()
    const accept = fire('beforeunload')
    expect(accept).toHaveBeenCalledTimes(1)
    expect(count()).toBe(1)
  })

  it('leaves confirm dialogs to their own handlers', () => {
    const { count, fire } = setup()
    const accept = fire('confirm')
    expect(accept).not.toHaveBeenCalled()
    expect(count()).toBe(0)
  })
})
