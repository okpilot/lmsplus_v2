import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReviewExplainer } from './review-explainer'

describe('ReviewExplainer', () => {
  it('renders the toggle button', () => {
    render(<ReviewExplainer />)
    expect(screen.getByText('How Smart Review works')).toBeInTheDocument()
  })

  it('is collapsed by default', () => {
    render(<ReviewExplainer />)
    expect(screen.queryByText(/spaced repetition/)).not.toBeInTheDocument()
  })

  it('expands on click to show explanation', () => {
    render(<ReviewExplainer />)
    fireEvent.click(screen.getByText('How Smart Review works'))
    expect(screen.getByText(/spaced repetition/)).toBeInTheDocument()
  })

  it('collapses on second click', () => {
    render(<ReviewExplainer />)
    const toggle = screen.getByText('How Smart Review works')
    fireEvent.click(toggle)
    expect(screen.getByText(/spaced repetition/)).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText(/spaced repetition/)).not.toBeInTheDocument()
  })

  it('sets aria-expanded to false when collapsed', () => {
    render(<ReviewExplainer />)
    const button = screen.getByRole('button', { name: /how smart review works/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('sets aria-expanded to true when expanded', () => {
    render(<ReviewExplainer />)
    const button = screen.getByRole('button', { name: /how smart review works/i })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
