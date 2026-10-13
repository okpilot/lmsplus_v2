import { describe, expect, it } from 'vitest'
import { isEmptyNode } from './is-empty-node'

describe('isEmptyNode', () => {
  it.each([null, undefined, false, ''])('treats %s as empty', (node) => {
    expect(isEmptyNode(node)).toBe(true)
  })

  it.each([0, Number.NaN, 'text', true])('treats %s as renderable', (node) => {
    expect(isEmptyNode(node)).toBe(false)
  })
})
