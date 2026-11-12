import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

import { SubjectsUnavailablePanel } from './subjects-unavailable-panel'

beforeEach(() => {
  mockRefresh.mockReset()
})

describe('SubjectsUnavailablePanel', () => {
  it('refreshes the route when Try again is clicked', async () => {
    render(<SubjectsUnavailablePanel mode="study" onModeChange={vi.fn()} examAvailable />)

    expect(screen.getByRole('alert')).toHaveTextContent('Quiz subjects could not be loaded.')
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }))

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})
