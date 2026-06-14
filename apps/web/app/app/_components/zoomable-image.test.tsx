import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZoomableImage } from './zoomable-image'

describe('ZoomableImage', () => {
  it('renders the image with the correct src', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    const link = screen.getByRole('link')
    const img = link.querySelector('img')
    expect(img).toHaveAttribute('src', '/test.png')
  })

  it('wraps the image in a link that opens the source in a new tab', () => {
    render(<ZoomableImage src="https://cdn.example.com/runway.png" alt="Runway diagram" />)
    const link = screen.getByRole('link', { name: /open image in new tab: runway diagram/i })
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/runway.png')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('marks the nested image presentational so it does not double-announce', () => {
    render(<ZoomableImage src="/test.png" alt="Runway diagram" />)
    const img = screen.getByRole('link').querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies custom className to the image', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" className="max-h-64" />)
    const img = screen.getByRole('link').querySelector('img')
    expect(img?.className).toContain('max-h-64')
  })
})
