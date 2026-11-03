import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Label } from './label'

describe('Label', () => {
  it('uses text-label and text-muted-foreground, not text-sm', () => {
    render(<Label>Email</Label>)
    const cls = screen.getByText('Email').className.split(/\s+/)
    expect(cls).toContain('text-label')
    expect(cls).toContain('text-muted-foreground')
    expect(cls).not.toContain('text-sm')
  })
})
