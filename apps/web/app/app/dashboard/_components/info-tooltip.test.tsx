import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InfoTooltip } from './info-tooltip'

const BASE_PROPS = {
  label: 'What does this mean?',
  title: 'Daily Activity',
  description: 'Each square shows how many questions you answered that day.',
}
const trigger = () => screen.getByRole('button', { name: /^What does this mean\?/ })

describe('InfoTooltip', () => {
  it('renders the trigger button with the provided aria-label', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    expect(trigger()).toBeInTheDocument()
  })

  it('renders no panel before interaction', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    expect(screen.queryByText('Daily Activity')).not.toBeInTheDocument()
  })

  it('shows the title and description when the trigger is clicked', async () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    await userEvent.click(trigger())
    expect(await screen.findByText('Daily Activity')).toBeInTheDocument()
    expect(
      screen.getByText('Each square shows how many questions you answered that day.'),
    ).toBeInTheDocument()
  })

  it('hides the panel when the trigger is clicked a second time (toggle)', async () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    await userEvent.click(trigger())
    await screen.findByText('Daily Activity')
    await userEvent.click(trigger())
    await waitFor(() => expect(screen.queryByText('Daily Activity')).not.toBeInTheDocument())
  })

  it('closes the panel when a click occurs outside', async () => {
    render(
      <div>
        <InfoTooltip {...BASE_PROPS} />
        <button type="button">Outside</button>
      </div>,
    )
    await userEvent.click(trigger())
    await screen.findByText('Daily Activity')
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => expect(screen.queryByText('Daily Activity')).not.toBeInTheDocument())
  })

  it('opens on hover', async () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    await userEvent.hover(trigger())
    expect(await screen.findByText('Daily Activity')).toBeInTheDocument()
  })
})

describe('InfoTooltip trigger name', () => {
  it('includes the description', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    expect(trigger()).toHaveAccessibleName(
      'What does this mean?. Each square shows how many questions you answered that day.',
    )
  })
})

describe('InfoTooltip floating surface', () => {
  it('floats with a ring and shadow, caption text and no border', async () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    await userEvent.click(trigger())
    const el = await screen.findByRole('dialog')
    expect(el).toHaveClass('ring-1', 'shadow-raised', 'text-caption')
    expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
  })
})
