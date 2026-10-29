import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TabCount, Tabs, TabsList, TabsPanel, TabsTab } from './tabs'

function Example() {
  return (
    <Tabs defaultValue="one">
      <TabsList aria-label="Sections">
        <TabsTab value="one">
          One <TabCount data-testid="count">3</TabCount>
        </TabsTab>
        <TabsTab value="two">Two</TabsTab>
      </TabsList>
      <TabsPanel value="one">first</TabsPanel>
      <TabsPanel value="two">second</TabsPanel>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('renders a tablist containing tabs', () => {
    render(<Example />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('marks the active tab with data-active and the selected look classes', () => {
    render(<Example />)
    const tab = screen.getByRole('tab', { name: /One/ })
    expect(tab).toHaveAttribute('data-active')
    expect(tab).toHaveClass(
      'data-active:bg-card',
      'data-active:border-primary',
      'data-active:text-primary-text',
    )
    expect(screen.getByRole('tab', { name: 'Two' })).not.toHaveAttribute('data-active')
  })

  it('moves focus and selection together on ArrowRight (activateOnFocus)', async () => {
    const user = userEvent.setup()
    render(<Example />)
    screen.getByRole('tab', { name: /One/ }).focus()
    await user.keyboard('{ArrowRight}')
    const two = screen.getByRole('tab', { name: 'Two' })
    expect(two).toHaveFocus()
    expect(two).toHaveAttribute('aria-selected', 'true')
  })

  it('draws the list as a muted track', () => {
    render(<Example />)
    expect(screen.getByRole('tablist')).toHaveClass('bg-muted', 'p-1')
  })
})

describe('TabCount', () => {
  it('is a card chip by default and soft blue inside the active tab', () => {
    render(<Example />)
    expect(screen.getByTestId('count')).toHaveClass('bg-card', 'group-data-active:bg-info-soft')
  })
})
