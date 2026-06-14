import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZoomableImage } from './zoomable-image'

describe('ZoomableImage', () => {
  it('renders the image with correct src and alt', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    const img = screen.getByAltText('Test image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/test.png')
  })

  it('wraps the image in a link that opens the source in a new tab', () => {
    render(<ZoomableImage src="https://cdn.example.com/runway.png" alt="Runway diagram" />)
    const link = screen.getByRole('link', { name: /open image in new tab: runway diagram/i })
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/runway.png')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders the image inside the link', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    const link = screen.getByRole('link')
    expect(link.querySelector('img')).toHaveAttribute('alt', 'Test image')
  })

  it('applies custom className to the image', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" className="max-h-64" />)
    const img = screen.getByAltText('Test image')
    expect(img.className).toContain('max-h-64')
  })
})
