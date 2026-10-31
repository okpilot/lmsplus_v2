import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AlertDialog, AlertDialogContent, AlertDialogTitle } from './alert-dialog'

describe('AlertDialog', () => {
  it('shows its content on the white popover surface', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(screen.getByRole('alertdialog').className).toContain('bg-popover')
  })
})

describe('AlertDialog elevation', () => {
  it('floats with a shadow', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(screen.getByRole('alertdialog')).toHaveClass('shadow-overlay')
  })
})

describe('AlertDialog scrim', () => {
  it('dims the page with the scrim token and no raw black', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    )
    const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]')
    expect(overlay).toHaveClass('bg-scrim')
    expect(overlay?.className).not.toContain('bg-black/')
    expect(screen.getByRole('alertdialog').className).not.toContain('shadow-lg')
  })
})
