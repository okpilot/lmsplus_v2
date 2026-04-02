import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadJsonFile } from './download-json'

describe('downloadJsonFile', () => {
  let createdUrl: string
  let appendedElement: HTMLAnchorElement | null
  let clickedElement: HTMLAnchorElement | null
  let removedElement: HTMLAnchorElement | null
  let revokedUrl: string

  beforeEach(() => {
    createdUrl = ''
    appendedElement = null
    clickedElement = null
    removedElement = null
    revokedUrl = ''

    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      createdUrl = 'blob:mock-url'
      return createdUrl
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revokedUrl = url
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      appendedElement = node as HTMLAnchorElement
      return node
    })

    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag)
      vi.spyOn(el, 'click').mockImplementation(() => {
        clickedElement = el as HTMLAnchorElement
      })
      vi.spyOn(el, 'remove').mockImplementation(() => {
        removedElement = el as HTMLAnchorElement
      })
      return el
    })

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('creates a blob URL and triggers a download click', () => {
    downloadJsonFile({ foo: 'bar' }, 'export.json')

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')

    expect(appendedElement).not.toBeNull()
    expect(appendedElement?.href).toBe('blob:mock-url')
    expect(appendedElement?.download).toBe('export.json')

    expect(clickedElement).not.toBeNull()
    expect(removedElement).not.toBeNull()
  })

  it('serialises the data as pretty-printed JSON in the blob', async () => {
    const data = { answer: 42, nested: { ok: true } }
    downloadJsonFile(data, 'data.json')

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob
    const text = await blob.text()
    expect(text).toBe(JSON.stringify(data, null, 2))
  })

  it('uses the provided filename as the download attribute', () => {
    downloadJsonFile({}, 'my-export.json')
    expect(appendedElement?.download).toBe('my-export.json')
  })

  it('revokes the blob URL after the current call stack clears', () => {
    downloadJsonFile({}, 'test.json')

    expect(revokedUrl).toBe('')

    vi.runAllTimers()

    expect(revokedUrl).toBe('blob:mock-url')
  })

  it('handles an array as the root data value', async () => {
    const data = [1, 2, 3]
    downloadJsonFile(data, 'array.json')

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob
    const text = await blob.text()
    expect(text).toBe(JSON.stringify(data, null, 2))
  })

  it('handles null data without throwing', () => {
    expect(() => downloadJsonFile(null, 'null.json')).not.toThrow()
  })

  it('handles an empty object without throwing', () => {
    expect(() => downloadJsonFile({}, 'empty.json')).not.toThrow()
  })
})
