import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LookupErrorAlerts } from './lookup-error-alerts'

describe('LookupErrorAlerts', () => {
  it('warns that saved quizzes could not be loaded', () => {
    render(<LookupErrorAlerts examFailed={false} practiceFailed={false} savedFailed />)

    expect(screen.getByRole('alert').textContent).toMatch(/saved quizzes/i)
  })

  it('shows no alert when every lookup succeeded', () => {
    render(<LookupErrorAlerts examFailed={false} practiceFailed={false} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
