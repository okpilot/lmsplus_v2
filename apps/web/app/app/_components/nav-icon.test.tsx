import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavIcon } from './nav-icon'

describe('NavIcon', () => {
  it('renders an SVG for the home icon', () => {
    const { container } = render(<NavIcon name="home" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the file-question icon', () => {
    const { container } = render(<NavIcon name="file-question" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the bar-chart icon', () => {
    const { container } = render(<NavIcon name="bar-chart" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the book-open icon', () => {
    const { container } = render(<NavIcon name="book-open" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the list icon', () => {
    const { container } = render(<NavIcon name="list" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the users icon', () => {
    const { container } = render(<NavIcon name="users" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the settings icon', () => {
    const { container } = render(<NavIcon name="settings" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the clipboard-check icon', () => {
    const { container } = render(<NavIcon name="clipboard-check" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an SVG for the shield-check icon', () => {
    const { container } = render(<NavIcon name="shield-check" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('applies the supplied className to the shield-check SVG', () => {
    const { container } = render(<NavIcon name="shield-check" className="h-6 w-6" />)
    expect(container.querySelector('svg')).toHaveClass('h-6', 'w-6')
  })

  it('hides every icon from assistive technology', () => {
    const { container } = render(<NavIcon name="shield-check" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the default size class when no className is provided', () => {
    const { container } = render(<NavIcon name="home" />)
    expect(container.querySelector('svg')).toHaveClass('h-5', 'w-5')
  })
})
