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
