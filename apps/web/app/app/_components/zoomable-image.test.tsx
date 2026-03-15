import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZoomableImage } from './zoomable-image'

describe('ZoomableImage', () => {
  it('renders the thumbnail image with correct src and alt', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    const img = screen.getByAltText('Test image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/test.png')
  })

  it('opens a fullscreen dialog when clicked', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    const thumbnail = screen.getByAltText('Test image')
    fireEvent.click(thumbnail)
    // After clicking, there should be two images (thumbnail + fullsize in dialog)
    const images = screen.getAllByAltText('Test image')
    expect(images.length).toBe(2)
  })

  it('dialog popup carries an aria-label that includes the image alt text', () => {
    render(<ZoomableImage src="/test.png" alt="Runway diagram" />)
    fireEvent.click(screen.getByAltText('Runway diagram'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Zoomed image: Runway diagram')
  })

  it('closes the dialog when close button is clicked', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" />)
    fireEvent.click(screen.getByAltText('Test image'))
    expect(screen.getAllByAltText('Test image')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('Close'))
    // Back to just the thumbnail
    expect(screen.getAllByAltText('Test image')).toHaveLength(1)
  })

  it('applies custom className to thumbnail', () => {
    render(<ZoomableImage src="/test.png" alt="Test image" className="max-h-64" />)
    const img = screen.getByAltText('Test image')
    expect(img.className).toContain('max-h-64')
  })
})
