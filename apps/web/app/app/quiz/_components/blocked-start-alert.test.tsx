import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BlockedStartAlert } from './blocked-start-alert'

const BASE = {
  offer: null,
  saving: false,
  error: null,
  onAccept: vi.fn(),
}

describe('BlockedStartAlert', () => {
  it('renders nothing when there is no message and no offer', () => {
    const { container } = render(
      <BlockedStartAlert message={null} blocked={BASE} startLabel="quiz" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the start failure message as an alert', () => {
    render(<BlockedStartAlert message="No questions" blocked={BASE} startLabel="quiz" />)
    expect(screen.getByRole('alert')).toHaveTextContent('No questions')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers to save the open quiz and start the new one', async () => {
    const onAccept = vi.fn()
    render(
      <BlockedStartAlert
        message="Another session is active"
        blocked={{ ...BASE, onAccept, offer: { sessionId: 's1', subjectName: 'Air Law' } }}
        startLabel="quiz"
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Save quiz for later and start quiz' }),
    )

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Air Law/)).toBeInTheDocument()
  })

  it('disables the offer while saving', () => {
    render(
      <BlockedStartAlert
        message="Another session is active"
        blocked={{ ...BASE, saving: true, offer: { sessionId: 's1', subjectName: 'Air Law' } }}
        startLabel="exam"
      />,
    )
    expect(
      screen.getByRole('button', { name: /Save quiz for later and start exam/ }),
    ).toBeDisabled()
  })

  it('shows the takeover or save error', () => {
    render(
      <BlockedStartAlert
        message="Another session is active"
        blocked={{
          ...BASE,
          error: 'Could not take over',
          offer: { sessionId: 's1', subjectName: 'Air Law' },
        }}
        startLabel="quiz"
      />,
    )
    expect(screen.getByText('Could not take over')).toBeInTheDocument()
  })
})
