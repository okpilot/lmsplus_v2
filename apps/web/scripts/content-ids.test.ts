import { describe, expect, it } from 'vitest'
import {
  assertNoDerivedIdCollisions,
  deriveContentId,
  ID_VERSION,
  normalizeForId,
} from './content-ids'

const AT = 'test.json (VRT-ORD-99)'

describe('the canonical form an id is derived from', () => {
  // These outputs are a STABILITY CONTRACT, not a description of the current implementation:
  // every id stored in the database was derived through this function, so changing what it
  // returns orphans those rows. Pinned as literals so such a change cannot land quietly.
  it('trims the ends, collapses inner runs of whitespace, and folds case', () => {
    expect(normalizeForId('  Line   UP  ')).toBe('line up')
    expect(normalizeForId('Contact\tTOWER\n\nnow')).toBe('contact tower now')
    expect(normalizeForId('Downwind leg')).toBe('downwind leg')
  })

  it('leaves punctuation alone, so "RWY 27" and "RWY-27" stay different answers', () => {
    expect(normalizeForId('RWY-27')).toBe('rwy-27')
    expect(normalizeForId('Say again, please.')).toBe('say again, please.')
    expect(normalizeForId('RWY 27')).not.toBe(normalizeForId('RWY-27'))
  })

  it('leaves an already-canonical string untouched', () => {
    expect(normalizeForId('final approach')).toBe('final approach')
  })
})

describe('an id derived from content', () => {
  // Literal expectations, deliberately. An id is `prefix + version + 8 hex chars`, and each of
  // those three parts is baked into stored rows — a changed digest, a wider slice or a bumped
  // version all silently orphan existing content, so all three are pinned here.
  it('is the kind, then the scheme version, then eight hex characters of the digest', () => {
    expect(deriveContentId('o', ['Line up'])).toBe('o1d69d3e49')
    expect(deriveContentId('l', ['Downwind leg'])).toBe('l128b13785')
    expect(deriveContentId('z', ['rwy-2709-lh-pattern', '0'])).toBe('z1a077e7d6')
  })

  it('carries the scheme version right after the kind', () => {
    const id = deriveContentId('o', ['Contact tower'])
    expect(id.slice(0, 2)).toBe(`o${ID_VERSION}`)
    expect(id).toHaveLength(2 + 8)
    expect(id.slice(2)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('gives the same text the same id every time', () => {
    expect(deriveContentId('o', ['Taxi to holding point'])).toBe(
      deriveContentId('o', ['Taxi to holding point']),
    )
  })

  it('gives different text different ids', () => {
    expect(deriveContentId('o', ['Contact tower'])).not.toBe(
      deriveContentId('o', ['Read back the clearance']),
    )
  })

  it('keeps the same text apart when it is used for different kinds of thing', () => {
    // Zone ids and label ids must never coincide — the diagram gate rejects a config where one
    // id serves as both, because a shared id would correlate a zone to its answer chip.
    expect(deriveContentId('z', ['Downwind leg'])).not.toBe(deriveContentId('l', ['Downwind leg']))
  })

  it('gives an ordering item and a label over the same text the same eight-character digest', () => {
    // The prefix character is PREPENDED to the digest, not hashed into it — only `parts` reaches
    // update(). So two kinds derived over the SAME `parts` share all 8 digest characters and
    // differ solely in that leading character, which is then the ONLY thing keeping them apart.
    //
    // Ordering item ('o') vs diagram label ('l') IS that pair — both derive from `[text]` — which
    // is why the fixture uses them. Zone vs label is deliberately not used here: production zone
    // ids derive from `[imageRef, index]`, so they differ in hashed input too. See the
    // content-ids.ts docblock, which also warns not to read that as slack — it is an accident of
    // today's parts domains, not a guarantee.
    //
    // If the implementation changed to hash the prefix in, this fails: the 8 chars would diverge
    // even though the diagram gate's zone/label disjointness rule would still hold.
    const text = ['Downwind leg']
    expect(deriveContentId('o', text).slice(2)).toBe(deriveContentId('l', text).slice(2))
    // Literal pin for the ordering side; the label side ('l128b13785') is already pinned by the
    // 'kind + version + digest' test above. Together they make the shared digest a stability
    // contract rather than a passing-but-unpinned implementation detail.
    expect(deriveContentId('o', text)).toBe('o128b13785')
  })

  it('ignores case and spacing differences the reader cannot see', () => {
    expect(deriveContentId('o', ['LINE   UP'])).toBe(deriveContentId('o', ['Line up']))
    expect(deriveContentId('o', ['  Line up  '])).toBe(deriveContentId('o', ['Line up']))
  })

  it('joins its parts, so a zone on the same image at a different position differs', () => {
    expect(deriveContentId('z', ['rwy-2709-lh-pattern', '1'])).not.toBe(
      deriveContentId('z', ['rwy-2709-lh-pattern', '0']),
    )
  })
})

describe('two pieces of content that derive one id', () => {
  it('are rejected, naming both sources and blaming normalization', () => {
    const sources = ['Line up', 'LINE   UP']
    const ids = sources.map((source) => ({ id: deriveContentId('o', [source]), source }))
    // Both really do derive the same id — otherwise this asserts nothing about the collision.
    expect(ids[0].id).toBe(ids[1].id)
    let message = ''
    try {
      assertNoDerivedIdCollisions(ids, AT)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    // Both sources by name: the author is looking at two visibly different strings and has to
    // be able to tell WHICH two collided, and why two different-looking strings could.
    expect(message).toContain('"Line up"')
    expect(message).toContain('"LINE   UP"')
    expect(message).toContain('capitalisation or spacing')
    expect(message).toContain(AT)
  })

  it('are rejected even when the collision is not the first pair in the list', () => {
    const sources = ['Contact tower', 'Read back the clearance', 'contact   TOWER']
    const ids = sources.map((source) => ({ id: deriveContentId('o', [source]), source }))
    expect(() => assertNoDerivedIdCollisions(ids, AT)).toThrow(/"contact {3}TOWER"/)
  })
})

describe('a collection of distinct content', () => {
  it('is accepted', () => {
    const sources = ['Contact tower', 'Taxi to holding point', 'Read back the clearance']
    const ids = sources.map((source) => ({ id: deriveContentId('o', [source]), source }))
    expect(() => assertNoDerivedIdCollisions(ids, AT)).not.toThrow()
  })

  it('is accepted when empty', () => {
    expect(() => assertNoDerivedIdCollisions([], AT)).not.toThrow()
  })
})
