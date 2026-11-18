import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyCodeButton } from './copy-code-button'

const writeText = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
})

function setup() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  render(<CopyCodeButton code="ABC123" label="Copy code for Ann" />)
  return user
}

describe('CopyCodeButton', () => {
  it('copies the code and announces it', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Copy code for Ann' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Code copied'))
    expect(writeText).toHaveBeenCalledWith('ABC123')
  })

  it('announces nothing when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Copy code for Ann' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
