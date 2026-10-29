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
