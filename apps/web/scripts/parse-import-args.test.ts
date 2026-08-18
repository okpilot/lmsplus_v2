import { describe, expect, it } from 'vitest'
import { parseImportArgs } from './parse-import-args'

describe('parseImportArgs', () => {
  it('reads both flag values from a well-formed invocation', () => {
    expect(parseImportArgs(['--file', 'q.json', '--base-dir', '/imgs'])).toEqual({
      file: 'q.json',
      baseDir: '/imgs',
    })
  })

  it('accepts the flags in either order', () => {
    expect(parseImportArgs(['--base-dir', '/imgs', '--file', 'q.json'])).toEqual({
      file: 'q.json',
      baseDir: '/imgs',
    })
  })

  it('leaves a value empty when its flag is absent', () => {
    expect(parseImportArgs(['--file', 'q.json'])).toEqual({ file: 'q.json', baseDir: '' })
    expect(parseImportArgs([])).toEqual({ file: '', baseDir: '' })
  })

  it('ignores a trailing flag that has no value after it', () => {
    expect(parseImportArgs(['--file', 'q.json', '--base-dir'])).toEqual({
      file: 'q.json',
      baseDir: '',
    })
  })

  it('ignores arguments it does not recognise', () => {
    expect(parseImportArgs(['--verbose', '--file', 'q.json'])).toEqual({
      file: 'q.json',
      baseDir: '',
    })
  })

  // The case the `else if` exists for. With two flags it cannot change the outcome — the run dies
  // on the bogus `file` first — so this pins the parser's contract rather than a live symptom:
  // a value consumed by one flag is never re-read by another.
  it('never lets one flag consume a value another flag already took', () => {
    const { file, baseDir } = parseImportArgs(['--file', '--base-dir', '/d'])
    expect(file).toBe('--base-dir')
    expect(baseDir).toBe('')
  })
})
