import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LabeledTextarea } from './labeled-textarea'

describe('LabeledTextarea', () => {
  it('styles the label text-label + text-muted-foreground without text-[13px]', () => {
    render(
      <LabeledTextarea
        label="Notes"
        value=""
        placeholder="p"
        rows={2}
        disabled={false}
        onChange={vi.fn()}
      />,
    )
    const cls = screen.getByText('Notes').className
    expect(cls).toMatch(/(?<![\w-])text-label(?![\w-])/)
    expect(cls).toContain('text-muted-foreground')
    expect(cls).not.toContain('text-[13px]')
  })
})
