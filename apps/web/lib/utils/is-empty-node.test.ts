import { describe, expect, it } from 'vitest'
import { isEmptyNode } from './is-empty-node'

describe('isEmptyNode', () => {
  it.each([null, undefined, false, true, ''])('treats %j as empty', (node) => {
    expect(isEmptyNode(node)).toBe(true)
  })

  it('treats an empty array as empty', () => {
    expect(isEmptyNode([])).toBe(true)
  })

  it('treats an array of only empty nodes as empty', () => {
    expect(isEmptyNode([null, false, [true]])).toBe(true)
  })

  it.each([0, Number.NaN, 'text'])('treats %j as renderable', (node) => {
    expect(isEmptyNode(node)).toBe(false)
  })

  it('treats an array holding a renderable node as renderable', () => {
    expect(isEmptyNode([null, 'a'])).toBe(false)
    expect(isEmptyNode([0])).toBe(false)
  })
})
