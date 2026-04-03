import { describe, expect, it } from 'vitest'
import { buildPageNumbers } from './pagination-bar'

describe('buildPageNumbers', () => {
  it('returns all pages when total is 7 or less', () => {
    expect(buildPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('returns single page for total 1', () => {
    expect(buildPageNumbers(1, 1)).toEqual([1])
  })

  it('shows ellipsis after page 1 when current is far from start', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages[0]).toBe(1)
    expect(pages[1]).toBe('...')
  })

  it('shows ellipsis before last page when current is far from end', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages[pages.length - 1]).toBe(10)
    expect(pages[pages.length - 2]).toBe('...')
  })

  it('shows current page and its neighbors in the middle', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages).toContain(4)
    expect(pages).toContain(5)
    expect(pages).toContain(6)
  })

  it('does not show leading ellipsis when current is near start', () => {
    const pages = buildPageNumbers(2, 10)
    expect(pages).toEqual([1, 2, 3, '...', 10])
  })

  it('does not show trailing ellipsis when current is near end', () => {
    const pages = buildPageNumbers(9, 10)
    expect(pages).toEqual([1, '...', 8, 9, 10])
  })

  it('shows both ellipses when current is in the middle of a large set', () => {
    const pages = buildPageNumbers(10, 20)
    expect(pages).toEqual([1, '...', 9, 10, 11, '...', 20])
  })

  it('handles current at page 1 of a large set', () => {
    const pages = buildPageNumbers(1, 20)
    expect(pages[0]).toBe(1)
    expect(pages[1]).toBe(2)
    expect(pages).toContain('...')
    expect(pages[pages.length - 1]).toBe(20)
  })

  it('handles current at last page of a large set', () => {
    const pages = buildPageNumbers(20, 20)
    expect(pages[0]).toBe(1)
    expect(pages).toContain('...')
    expect(pages[pages.length - 1]).toBe(20)
    expect(pages[pages.length - 2]).toBe(19)
  })
})
