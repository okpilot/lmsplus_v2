import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TileLabel } from './tile-label'

describe('TileLabel', () => {
  it('shows the short and full names and a tooltip trigger named after the full name', () => {
    render(<TileLabel short="Today" full="Questions Today" description="Goal progress" />)
    expect(screen.getByText('Today').className).toContain('md:hidden')
    expect(screen.getAllByText('Questions Today')[0]?.className).toContain('hidden md:inline')
    expect(screen.getByRole('button', { name: 'What is Questions Today?' })).toBeInTheDocument()
  })
})
