import { describe, expect, it } from 'vitest'
import part1 from './content/vfr-rt-part1-acronyms.json'
import part2 from './content/vfr-rt-part2-dialog-pilot.json'
import p3diagram from './content/vfr-rt-part3-diagram.json'
import p3emergency from './content/vfr-rt-part3-mc-emergency.json'
import p3numbers from './content/vfr-rt-part3-mc-numbers.json'
import p3posrep from './content/vfr-rt-part3-mc-posrep.json'
import p3ordering from './content/vfr-rt-part3-ordering.json'
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

  it.each([
    ['vfr-rt-part1-acronyms.json', part1],
    ['vfr-rt-part2-dialog-pilot.json', part2],
    ['vfr-rt-part3-mc-numbers.json', p3numbers],
    ['vfr-rt-part3-mc-emergency.json', p3emergency],
    ['vfr-rt-part3-mc-posrep.json', p3posrep],
    ['vfr-rt-part3-ordering.json', p3ordering],
    ['vfr-rt-part3-diagram.json', p3diagram],
  ])('honours the lifecycle %s declares', (name, file) => {
    // Pins the GATE against every real shipped file without hardcoding which pool is released —
    // an earlier version asserted "Part 2 must stay refused", which broke the moment that pool
    // was evaluated and graduated. What must hold forever is that the verdict follows the file's
    // own `lifecycle` field and nothing else, least of all a prose field an author can rewrite.
    //
    // The counterfactual below is what keeps this test HONEST. Following the declared value is
    // a one-sided assertion: every shipped file is now `released`, so without the second half
    // only the `not.toThrow()` arm would ever execute and deleting the throw from
    // assertReleasedForRemote would leave this green. Re-asserting the same object with the
    // lifecycle flipped exercises the refusing arm on every row, whatever the files declare —
    // so the arm cannot go dead again the next time a pool graduates.
    const declared = (file as { lifecycle?: unknown }).lifecycle
    expect(declared, `${name} declares no lifecycle`).toBeDefined()

    // Message-pinned, not bare: a bare toThrow() goes green on ANY error, so it could not tell the
    // lifecycle gate from an unrelated throw added to assertReleasedForRemote later — the same
    // reason diagram-content.test.ts pins its messages.
    const REFUSAL = /refusing to write this file to a remote database/
    if (declared === 'released') {
      expect(() => assertReleasedForRemote(file, name)).not.toThrow()
      expect(() => assertReleasedForRemote({ ...file, lifecycle: 'pilot' }, name)).toThrow(REFUSAL)
    } else {
      expect(() => assertReleasedForRemote(file, name)).toThrow(REFUSAL)
      expect(() => assertReleasedForRemote({ ...file, lifecycle: 'released' }, name)).not.toThrow()
    }
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
