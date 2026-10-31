import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

describe('Dialog', () => {
  it('floats with a shadow', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toHaveClass('shadow-overlay')
  })

  it('dims the page with the scrim token and no raw black', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toHaveClass('bg-scrim')
    expect(overlay?.className).not.toContain('bg-black/')
    expect(screen.getByRole('dialog').className).not.toContain('shadow-lg')
  })
})

describe('DialogContent overlayClassName (B2b-12 AC 9)', () => {
  it('merges overlayClassName into the scrim overlay', () => {
    render(
      <Dialog open>
        <DialogContent overlayClassName="bg-red-500 supports-backdrop-filter:backdrop-blur-none">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toHaveClass('bg-red-500')
    expect(overlay?.className).toContain('backdrop-blur-none')
    expect(overlay?.className).not.toContain('backdrop-blur-xs')
  })
})
