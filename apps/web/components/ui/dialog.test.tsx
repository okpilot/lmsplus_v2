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
    expect(screen.getByRole('dialog')).toHaveClass('shadow-lg')
  })
})
