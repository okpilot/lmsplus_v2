import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from './sonner'

function toastFor(text: string) {
  const el = screen.getByText(text).closest('[data-sonner-toast]')
  expect(el).not.toBeNull()
  return el as HTMLElement
}

describe('Toaster', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
  })

  afterEach(() => {
    act(() => {
      toast.dismiss()
    })
    vi.unstubAllGlobals()
  })

  it('sizes a toast to its text', async () => {
    render(<Toaster />)
    act(() => {
      toast('Saved')
    })
    expect((await screen.findByText('Saved')).closest('[data-sonner-toast]')?.className).toContain(
      'w-fit!',
    )
  })

  it('lists several toasts one above the other instead of piling them', async () => {
    render(<Toaster />)
    act(() => {
      toast('First')
      toast('Second')
    })
    await screen.findByText('Second')
    expect(toastFor('First').dataset.expanded).toBe('true')
  })

  it.each([
    ['success', 'border-success-solid!', 'Name updated'],
    ['error', 'border-danger-solid!', 'Could not save'],
    ['warning', 'border-caution-solid!', 'Image too large'],
    ['info', 'border-info-solid!', 'Code sent'],
  ] as const)('outlines a %s toast in its colour', async (type, border, text) => {
    render(<Toaster />)
    act(() => {
      toast[type](text)
    })
    await screen.findByText(text)
    expect(toastFor(text).className).toContain(border)
  })
})
