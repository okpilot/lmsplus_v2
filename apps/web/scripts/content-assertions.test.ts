import { describe, expect, it } from 'vitest'
import part1 from './content/vfr-rt-part1-acronyms.json'
import part2 from './content/vfr-rt-part2-dialog-pilot.json'
import {
  assertReleasedForRemote,
  isLocalSupabaseUrl,
  requireRecord,
  requireText,
} from './content-assertions'

describe('requireText', () => {
  it('accepts a non-blank string', () => {
    expect(() => requireText('VRT-P2-DLG-01', "file[0]: 'num'")).not.toThrow()
  })

  it.each([
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['undefined', undefined],
    ['null', null],
    ['a number', 7],
    ['an object', { a: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => requireText(value, "file[0]: 'num'")).toThrow(/must be a non-empty string/)
  })

  it('names the offending field in the message so the operator can find it', () => {
    expect(() => requireText('', "content/foo.json[3] (VRT-P2-DLG-04): 'canonical'")).toThrow(
      "content/foo.json[3] (VRT-P2-DLG-04): 'canonical'",
    )
  })

  it('shows the received value in the message', () => {
    expect(() => requireText(42, 'label')).toThrow('got 42')
  })
})

describe('requireRecord', () => {
  it('accepts a plain object', () => {
    expect(() => requireRecord({ num: 'x' }, 'file[0]')).not.toThrow()
  })

  it.each([
    ['null', null],
    ['an array', [1, 2]],
    ['a string', 'nope'],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => requireRecord(value, 'file[0]')).toThrow(/must be an object/)
  })

  it('names the offending node in the message so the operator can find it', () => {
    expect(() => requireRecord(null, 'content/foo.json[2]')).toThrow('content/foo.json[2]')
  })
})

describe('assertReleasedForRemote', () => {
  it('lets a released batch through', () => {
    expect(() =>
      assertReleasedForRemote({ lifecycle: 'released' }, 'content/foo.json'),
    ).not.toThrow()
  })

  it.each([
    ['a pilot batch', { lifecycle: 'pilot' }],
    ['a file with no lifecycle key at all', {}],
    ['an undefined lifecycle', { lifecycle: undefined }],
    ['a non-string lifecycle', { lifecycle: 1 }],
    ['a null lifecycle', { lifecycle: null }],
    ['a boolean lifecycle', { lifecycle: true }],
    // Case and padding are NOT normalised: the comparison is against one exact literal, so a
    // near-miss is refused rather than quietly accepted.
    ['a differently-cased value', { lifecycle: 'RELEASED' }],
    ['a value with leading whitespace', { lifecycle: ' released' }],
    ['a value with trailing whitespace', { lifecycle: 'released ' }],
    ['an unrelated value', { lifecycle: 'draft' }],
  ])('refuses %s', (_label, file) => {
    expect(() => assertReleasedForRemote(file, 'content/foo.json')).toThrow(
      /refusing to write this file to a remote database/,
    )
  })

  it('names the file and the value it received so the operator can act on it', () => {
    expect(() => assertReleasedForRemote({ lifecycle: 'pilot' }, 'content/bar.json')).toThrow(
      'content/bar.json',
    )
    expect(() => assertReleasedForRemote({ lifecycle: 'pilot' }, 'content/bar.json')).toThrow(
      '"pilot"',
    )
  })

  it('agrees with what the two shipped content files declare', () => {
    // The regression this pins: Part 2 is un-evaluated and must stay refused, and the refusal
    // must not depend on any prose field an author is free to rewrite.
    expect(() => assertReleasedForRemote(part1, 'vfr-rt-part1-acronyms.json')).not.toThrow()
    expect(() => assertReleasedForRemote(part2, 'vfr-rt-part2-dialog-pilot.json')).toThrow()
  })
})

describe('isLocalSupabaseUrl', () => {
  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    // The scheme is not part of the predicate — the host is still this machine.
    'https://localhost',
    'http://[::1]:54321',
  ])('treats %s as this machine', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true)
  })

  it.each([
    // The importer's own prefix check reads this one as local; this is why --replace does not
    // reuse it.
    'http://localhost.example.com',
    'http://localhost.attacker.test:54321',
    'http://127.0.0.10',
    'https://abcdefghijklm.supabase.co',
    'http://notlocalhost',
  ])('refuses %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })

  it.each(['', 'localhost:54321', 'not a url'])('refuses the unparseable input %j', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })
})
