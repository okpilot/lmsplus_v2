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
    one.removeChild(document.createTextNode('gone'))
    one.removeChild(document.createTextNode('gone'))
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

  it('still throws when removing a node that belongs to an unrelated tree', () => {
    const one = document.createElement('div')
    const two = document.createElement('div')
    const child = document.createElement('span')
    two.appendChild(child)

    expect(() => one.removeChild(child)).toThrow(/not a child/i)
    expect(two.firstChild).toBe(child)
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('still throws when removing a descendant nested inside an ordinary element', () => {
    const root = document.createElement('div')
    const section = document.createElement('section')
    const deep = document.createElement('p')
    section.appendChild(deep)
    root.appendChild(section)

    expect(() => root.removeChild(deep)).toThrow(/not a child/i)
    expect(root.firstChild).toBe(section)
    expect(section.firstChild).toBe(deep)
  })

  it('still throws when inserting before a descendant nested inside an ordinary element', () => {
    const root = document.createElement('div')
    const section = document.createElement('section')
    const deep = document.createElement('p')
    section.appendChild(deep)
    root.appendChild(section)

    expect(() => root.insertBefore(document.createElement('i'), deep)).toThrow()
    expect(Array.from(root.childNodes)).toEqual([section])
  })

  it('still throws when the chain mixes a translator font with an ordinary element', () => {
    const root = document.createElement('div')
    const font = document.createElement('font')
    const div = document.createElement('div')
    const text = document.createTextNode('Hi')
    div.appendChild(text)
    font.appendChild(div)
    root.appendChild(font)

    expect(() => root.removeChild(text)).toThrow(/not a child/i)
    expect(root.firstChild).toBe(font)
  })

  it('removes a double font wrapper and inserts before it', () => {
    const { root, p, textNode } = paragraph('Hello')
    const outer = document.createElement('font')
    const inner = document.createElement('font')
    p.replaceChild(outer, textNode)
    outer.appendChild(inner)
    inner.appendChild(textNode)
    const icon = document.createElement('i')

    p.insertBefore(icon, textNode)
    expect(Array.from(p.childNodes)).toEqual([icon, outer])
    p.removeChild(textNode)
    expect(root.querySelectorAll('font')).toHaveLength(0)
  })

  it('still throws when removing a detached element', () => {
    const one = document.createElement('div')
    expect(() => one.removeChild(document.createElement('span'))).toThrow(/not a child/i)
  })

  it('rejects insertBefore and removeChild with too few arguments exactly as the browser does', () => {
    const p = document.createElement('p')
    const loose = (fn: unknown) => fn as (this: Node, ...a: unknown[]) => unknown
    const errorOf = (call: () => unknown) => {
      try {
        call()
      } catch (e) {
        return String(e)
      }
      return 'no throw'
    }
    const el = document.createElement('i')
    expect(errorOf(() => loose(Node.prototype.insertBefore).call(p, el))).toBe(
      errorOf(() => loose(originalInsertBefore).call(p, el)),
    )
    expect(errorOf(() => loose(Node.prototype.removeChild).call(p))).toBe(
      errorOf(() => loose(originalRemoveChild).call(p)),
    )
    expect(p.childNodes.length).toBe(0)
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
