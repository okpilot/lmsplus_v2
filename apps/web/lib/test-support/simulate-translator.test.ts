import { describe, expect, it } from 'vitest'
import { simulateTranslator } from './simulate-translator'

describe('simulateTranslator', () => {
  it('replaces every visible text node with nested font elements', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span>Submit</span> <b>Answer</b>'
    const original = root.querySelector('span')?.firstChild

    simulateTranslator(root)

    expect(root.querySelectorAll('font > font')).toHaveLength(2)
    expect(root.textContent).toBe('Submit Answer')
    expect(original?.parentNode).toBeNull()
  })
})
