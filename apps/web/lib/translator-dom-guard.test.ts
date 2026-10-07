import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateTranslator } from '@/lib/test-support/simulate-translator'
import { installTranslatorDomGuard } from './translator-dom-guard'

const originalRemoveChild = Node.prototype.removeChild
const originalInsertBefore = Node.prototype.insertBefore

let uninstall: () => void
const onFallback = vi.fn()
beforeEach(() => {
  onFallback.mockReset()
  uninstall = installTranslatorDomGuard(onFallback)
})
afterEach(() => {
  uninstall()
})

function paragraph(text: string) {
  const root = document.createElement('div')
  const p = document.createElement('p')
  const textNode = document.createTextNode(text)
  p.appendChild(textNode)
  root.appendChild(p)
  return { root, p, textNode }
}

describe('translator DOM guard', () => {
  it('lets React remove a text node the translator already detached', () => {
    const { root, p, textNode } = paragraph('Hello')
    simulateTranslator(root)
    expect(() => p.removeChild(textNode)).not.toThrow()
    expect(p.textContent).toBe('Hello')
  })

  it('removes the translator wrapper around a child React unmounts', () => {
    const { root, p, textNode } = paragraph('Hello')
    const wrapper = document.createElement('font')
    p.replaceChild(wrapper, textNode)
    wrapper.appendChild(textNode)

    expect(p.removeChild(textNode)).toBe(textNode)
    expect(root.querySelectorAll('font')).toHaveLength(0)
    expect(p.textContent).toBe('')
  })

  it('reports each kind of tolerated DOM mismatch once', () => {
    const one = document.createElement('div')
    one.removeChild(document.createElement('span'))
    one.removeChild(document.createElement('span'))
    one.insertBefore(document.createElement('i'), document.createTextNode('stray'))
    one.insertBefore(document.createElement('i'), document.createTextNode('stray'))

    expect(onFallback.mock.calls).toEqual([['remove'], ['insert']])
  })

  it('does not report ordinary DOM calls', () => {
    const root = document.createElement('div')
    const a = document.createElement('a')
    root.insertBefore(a, null)
    root.removeChild(a)

    expect(onFallback).not.toHaveBeenCalled()
  })

  it('inserts before the translator wrapper when the reference node was wrapped', () => {
    const root = document.createElement('div')
    const label = document.createElement('span')
    root.appendChild(label)
    const wrapper = document.createElement('font')
    root.replaceChild(wrapper, label)
    wrapper.appendChild(label)
    const icon = document.createElement('svg')

    root.insertBefore(icon, label)

    expect(Array.from(root.children)).toEqual([icon, wrapper])
  })

  it('appends when the reference node was detached by the translator', () => {
    const root = document.createElement('div')
    root.appendChild(document.createElement('span'))
    const stray = document.createTextNode('stray')
    const added = document.createElement('i')

    root.insertBefore(added, stray)

    expect(root.lastChild).toBe(added)
    expect(root.childNodes).toHaveLength(2)
  })

  it('removes and inserts ordinary children exactly as before', () => {
    const root = document.createElement('div')
    const a = document.createElement('a')
    const b = document.createElement('b')
    root.append(a, b)
    const c = document.createElement('i')

    root.insertBefore(c, b)
    expect(Array.from(root.children)).toEqual([a, c, b])
    expect(root.removeChild(c)).toBe(c)
    expect(Array.from(root.children)).toEqual([a, b])
    expect(root.insertBefore(c, null)).toBe(c)
    expect(Array.from(root.children)).toEqual([a, b, c])
  })

  it('ignores removal of a node that belongs to an unrelated tree', () => {
    const one = document.createElement('div')
    const two = document.createElement('div')
    const child = document.createElement('span')
    two.appendChild(child)

    expect(() => one.removeChild(child)).not.toThrow()
    expect(one.childNodes).toHaveLength(0)
    expect(two.firstChild).toBe(child)
  })

  it('restores the original DOM methods on uninstall', () => {
    uninstall()
    expect(Node.prototype.removeChild).toBe(originalRemoveChild)
    expect(Node.prototype.insertBefore).toBe(originalInsertBefore)
    const one = document.createElement('div')
    expect(() => one.removeChild(document.createElement('span'))).toThrow(/not a child/i)
    uninstall = installTranslatorDomGuard()
  })

  it('stays installed once when installed twice and still uninstalls cleanly', () => {
    const second = installTranslatorDomGuard()
    second()
    expect(Node.prototype.removeChild).toBe(originalRemoveChild)
    uninstall = installTranslatorDomGuard()
  })
})
