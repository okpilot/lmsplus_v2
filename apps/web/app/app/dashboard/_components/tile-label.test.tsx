import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TileLabel } from './tile-label'

describe('TileLabel', () => {
  it('shows the short and full names and a tooltip trigger named after the full name', () => {
    render(<TileLabel short="Today" full="Questions Today" description="Goal progress" />)
    expect(screen.getByText('Today').className).toContain('md:hidden')
    expect(screen.getAllByText('Questions Today')[0]?.className).toContain('hidden md:inline')
    expect(screen.getByRole('button', { name: /^What is Questions Today\?/ })).toBeInTheDocument()
  })

  it('uses the caption size on phones and the label size from md up', () => {
    const { container } = render(<TileLabel short="S" full="Full" description="d" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toMatch(/(?<![\w-])text-caption(?![\w-])/)
    expect(root.className).toContain('md:text-label')
  })
})
