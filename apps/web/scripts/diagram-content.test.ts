import { describe, expect, it } from 'vitest'
import { MAX_LABELS, MAX_ZONES } from '../app/app/quiz/actions/diagram-validation'
import {
  RWY_2709_IMAGE_REF,
  RWY_2709_LABELS,
  RWY_2709_ZONES,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'
import { assertDiagramConfig, deriveLabelId, deriveZoneId } from './diagram-content'

const AT = 'test.json (VRT-DIA-99)'

const IMAGE_REF = 'rwy-2709-lh-pattern'
const LABEL_TEXTS = ['Downwind leg', 'Base leg', 'Final approach']
const BOXES = [
  { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
  { x: 0.4, y: 0.5, w: 0.2, h: 0.1 },
  { x: 0.7, y: 0.2, w: 0.2, h: 0.1 },
]

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type Pair = { zone_id: string; label_id: string }
type Config = { image_ref: string; zones: Zone[]; labels: Label[]; answer: Pair[] }

function zones(): Zone[] {
  return BOXES.map((box, index) => ({ id: deriveZoneId(IMAGE_REF, index), ...box }))
}

function labels(): Label[] {
  return LABEL_TEXTS.map((text) => ({ id: deriveLabelId(text), text }))
}

/** A config built the only way the gate accepts one — every id through the derive helpers. */
function config(): Config {
  const zoneList = zones()
  const labelList = labels()
  return {
    image_ref: IMAGE_REF,
    zones: zoneList,
    labels: labelList,
    answer: zoneList.map((zone, index) => ({ zone_id: zone.id, label_id: labelList[index].id })),
  }
}

/** The same config with one zone replaced, so a single field can be put out of range. */
function withZone(index: number, zone: Record<string, unknown>): Config {
  const base = config()
  return { ...base, zones: base.zones.map((z, i) => (i === index ? (zone as Zone) : z)) }
}

describe('a derived diagram id', () => {
  // Literal expectations: these ids are written into the database and referenced by every
  // stored answer entry, so a change to the derivation must fail here, loudly.
  it('comes from the image and the position for a zone', () => {
    expect(deriveZoneId(IMAGE_REF, 0)).toBe('z1a077e7d6')
    expect(deriveZoneId(IMAGE_REF, 1)).toBe('z15e35c6a0')
    expect(deriveZoneId(IMAGE_REF, 2)).toBe('z1bccb7012')
  })

  it('comes from the visible text for a label', () => {
    expect(deriveLabelId('Downwind leg')).toBe('l128b13785')
    expect(deriveLabelId('Base leg')).toBe('l1b0cfc698')
    expect(deriveLabelId('Final approach')).toBe('l169114887')
  })

  it('never gives a zone and a label the same identifier', () => {
    const zoneIds = new Set(zones().map((zone) => zone.id))
    expect(labels().some((label) => zoneIds.has(label.id))).toBe(false)
  })
})

describe('the shipped RWY 27/09 traffic-pattern content', () => {
  // The layout module is imported by client components, so it cannot derive its ids at
  // runtime — node:crypto does not exist in the browser — and carries them as literals.
  // This block is the pin that makes those literals trustworthy: it re-derives every one
  // and prints the expected value if an id drifts from its image ref, index or text.
  it('identifies each drop zone by the image it sits on and where it sits', () => {
    RWY_2709_ZONES.forEach((zone, index) => {
      expect(zone.id).toBe(deriveZoneId(RWY_2709_IMAGE_REF, index))
    })
  })

  it('identifies each draggable chip by the text written on it', () => {
    for (const label of RWY_2709_LABELS) {
      expect(label.id).toBe(deriveLabelId(label.text))
    }
  })

  it('no longer reveals the flight order when the chips are sorted by identifier', () => {
    // Regression for the leak derivation closed. The 12 label ids were once hand-written
    // with strictly ascending second characters in canonical order (lk…, lm…, lp…, lq…),
    // the 3 distractors sorting last. A student could therefore sort the shuffled chips
    // by id, keep the first 9, and zip them index-wise against the zones — delivered in
    // stored order — to rebuild all 9 correct pairs from the payload alone.
    const canonical = RWY_2709_LABELS.map((label) => label.id)
    const sorted = [...canonical].sort()
    expect(sorted).not.toEqual(canonical)
    expect(sorted.slice(0, RWY_2709_ZONES.length)).not.toEqual(
      canonical.slice(0, RWY_2709_ZONES.length),
    )
  })
})

describe('a well-formed diagram config', () => {
  it('is accepted when every id was built with the derive helpers', () => {
    expect(() => assertDiagramConfig(config(), AT)).not.toThrow()
  })

  it('is accepted with spare labels that answer no zone', () => {
    // Distractor chips are deliberate (Decision 52) — labels may outnumber zones.
    const base = config()
    const distractor = { id: deriveLabelId('Crosswind leg'), text: 'Crosswind leg' }
    expect(() =>
      assertDiagramConfig({ ...base, labels: [...base.labels, distractor] }, AT),
    ).not.toThrow()
  })
})

describe('the shape of a diagram config', () => {
  it('rejects a config that is not an object', () => {
    expect(() => assertDiagramConfig(null, AT)).toThrow(/must be an object/)
    expect(() => assertDiagramConfig([], AT)).toThrow(/must be an object/)
  })

  it('rejects an extra top-level field an author added', () => {
    expect(() => assertDiagramConfig({ ...config(), answer_key: 'a' }, AT)).toThrow(
      /unexpected key\(s\) answer_key/,
    )
  })

  it('rejects a config missing one of its four parts', () => {
    const { image_ref, zones: zoneList, answer } = config()
    expect(() => assertDiagramConfig({ image_ref, zones: zoneList, answer }, AT)).toThrow(
      /missing key\(s\) labels/,
    )
  })

  it('rejects a blank image reference', () => {
    expect(() => assertDiagramConfig({ ...config(), image_ref: '   ' }, AT)).toThrow(
      /image_ref must be a non-empty string/,
    )
  })
})

describe('the zones of a diagram config', () => {
  it('rejects zones that are not an array', () => {
    expect(() => assertDiagramConfig({ ...config(), zones: 'nope' }, AT)).toThrow(
      /zones must be an array/,
    )
  })

  it('rejects a config with no zone to label', () => {
    expect(() => assertDiagramConfig({ ...config(), zones: [], answer: [] }, AT)).toThrow(
      `zones must hold between 1 and ${MAX_ZONES} entries (got 0)`,
    )
  })

  it('rejects more zones than a question may hold', () => {
    const tooMany = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      id: deriveZoneId(IMAGE_REF, i),
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
    }))
    expect(() => assertDiagramConfig({ ...config(), zones: tooMany }, AT)).toThrow(
      `zones must hold between 1 and ${MAX_ZONES} entries (got ${MAX_ZONES + 1})`,
    )
  })

  it('rejects an extra field on a zone', () => {
    const zone = { id: deriveZoneId(IMAGE_REF, 0), ...BOXES[0], hint: 'the first one' }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(/unexpected key\(s\) hint/)
  })

  it('rejects a zone missing one of its coordinates', () => {
    const zone = { id: deriveZoneId(IMAGE_REF, 0), x: 0.1, y: 0.1, w: 0.2 }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(/missing key\(s\) h/)
  })

  it('rejects a coordinate given as text', () => {
    const zone = { id: deriveZoneId(IMAGE_REF, 0), ...BOXES[0], x: '0.1' }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(
      /zones\[0\].x must be a number/,
    )
  })

  it('rejects a zone anchored outside the canvas', () => {
    const zone = { id: deriveZoneId(IMAGE_REF, 0), ...BOXES[0], x: 1.5 }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(
      /zones\[0\].x must be within \[0,1\]/,
    )
  })

  it('rejects a zone with no area to drop a chip into', () => {
    const zone = { id: deriveZoneId(IMAGE_REF, 0), ...BOXES[0], w: 0 }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(
      /zones\[0\].w must be greater than 0/,
    )
  })

  it('rejects a zone that runs off the edge of the artwork', () => {
    // x and w are each inside [0,1] on their own — only their sum leaves the canvas.
    const zone = { id: deriveZoneId(IMAGE_REF, 0), ...BOXES[0], x: 0.9, w: 0.2 }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(
      /zones\[0\]: x \+ w is 1.1, so the zone overflows the canvas/,
    )
  })

  it('rejects a blank zone identifier', () => {
    const zone = { id: '  ', ...BOXES[0] }
    expect(() => assertDiagramConfig(withZone(0, zone), AT)).toThrow(
      /zones\[0\].id must be a non-empty string/,
    )
  })

  it('rejects the same zone identifier used twice', () => {
    const base = config()
    const twinned = base.zones.map((zone) => ({ ...zone, id: base.zones[0].id }))
    expect(() => assertDiagramConfig({ ...base, zones: twinned }, AT)).toThrow(
      `zone id: '${base.zones[0].id}' appears at index 0 and again at index 1`,
    )
  })
})

describe('the labels of a diagram config', () => {
  it('rejects labels that are not an array', () => {
    expect(() => assertDiagramConfig({ ...config(), labels: {} }, AT)).toThrow(
      /labels must be an array/,
    )
  })

  it('rejects a config with no label to place', () => {
    expect(() => assertDiagramConfig({ ...config(), labels: [] }, AT)).toThrow(
      `labels must hold between 1 and ${MAX_LABELS} entries (got 0)`,
    )
  })

  it('rejects more labels than a question may hold', () => {
    const tooMany = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({
      id: deriveLabelId(`Leg number ${i}`),
      text: `Leg number ${i}`,
    }))
    expect(() => assertDiagramConfig({ ...config(), labels: tooMany }, AT)).toThrow(
      `labels must hold between 1 and ${MAX_LABELS} entries (got ${MAX_LABELS + 1})`,
    )
  })

  it('rejects an extra field on a label', () => {
    const base = config()
    const tagged = [{ ...base.labels[0], correct: true }, ...base.labels.slice(1)]
    expect(() => assertDiagramConfig({ ...base, labels: tagged }, AT)).toThrow(
      /unexpected key\(s\) correct/,
    )
  })

  it('rejects a label with nothing written on it', () => {
    const base = config()
    const blank = [{ ...base.labels[0], text: '  ' }, ...base.labels.slice(1)]
    expect(() => assertDiagramConfig({ ...base, labels: blank }, AT)).toThrow(
      /labels\[0\].text must be a non-empty string/,
    )
  })

  it('rejects the same label identifier used twice', () => {
    const base = config()
    const twinned = base.labels.map((label) => ({ ...label, id: base.labels[0].id }))
    expect(() => assertDiagramConfig({ ...base, labels: twinned }, AT)).toThrow(
      `label id: '${base.labels[0].id}' appears at index 0 and again at index 1`,
    )
  })

  it('rejects a label wearing a zone identifier', () => {
    // A shared id would let a student line a delivered zone up with its answer chip.
    const base = config()
    const shared = [{ ...base.labels[0], id: base.zones[0].id }, ...base.labels.slice(1)]
    expect(() => assertDiagramConfig({ ...base, labels: shared }, AT)).toThrow(
      `'${base.zones[0].id}' is used as both a zone id and a label id`,
    )
  })
})

describe("a question that uses only some of a diagram's zones", () => {
  // The traffic-pattern case: the artwork carries 9 zones (5 legs + 4 turns) but the question
  // asks only for the 5 legs. It MUST ship a subset — the DB requires answer.length ===
  // zones.length, so delivering 9 zones and answering 5 is rejected outright.
  function subset(indices: readonly number[]): Config {
    const labelList = labels()
    const zoneList = indices.map((canonical) => ({
      id: deriveZoneId(IMAGE_REF, canonical),
      ...BOXES[canonical],
    }))
    return {
      image_ref: IMAGE_REF,
      zones: zoneList,
      labels: labelList,
      answer: zoneList.map((zone, i) => ({ zone_id: zone.id, label_id: labelList[i].id })),
    }
  }

  it('accepts zones taken from non-consecutive canonical positions', () => {
    expect(() => assertDiagramConfig(subset([0, 2]), AT)).not.toThrow()
  })

  it('keeps every delivered zone answered exactly once', () => {
    const partial = subset([0, 2])
    partial.answer = partial.answer.slice(0, 1)
    expect(() => assertDiagramConfig(partial, AT)).toThrow()
  })

  it('rejects a subset whose zones run backwards through the diagram', () => {
    // Zones reach the student in stored order, so a reordered subset silently moves the drop
    // targets relative to the artwork even though every id is genuinely derived.
    const backwards = subset([2, 0])
    expect(() => assertDiagramConfig(backwards, AT)).toThrow(/is not a derived id/)
  })
})

describe('identifiers an author chose instead of deriving', () => {
  it('rejects a zone whose identifier was written by hand', () => {
    const base = config()
    const handWritten = [{ ...base.zones[0], id: 'z1deadbeef' }, ...base.zones.slice(1)]
    expect(() => assertDiagramConfig({ ...base, zones: handWritten }, AT)).toThrow(
      `zones[0].id 'z1deadbeef' is not a derived id`,
    )
  })

  it('rejects zones whose derived identifiers are transposed', () => {
    // The subtle failure: every id is genuinely derived, just silently swapped between two
    // zones. Only re-deriving catches it. The report names zones[1]: zones[0] carrying the
    // id for canonical position 1 is accepted as position 1, and it is the NEXT zone —
    // holding position 0's id, now below the ascending floor — that has nowhere left to match.
    const base = config()
    const swapped = [
      { ...base.zones[0], id: deriveZoneId(IMAGE_REF, 1) },
      { ...base.zones[1], id: deriveZoneId(IMAGE_REF, 0) },
      base.zones[2],
    ]
    expect(() => assertDiagramConfig({ ...base, zones: swapped }, AT)).toThrow(
      /zones\[1\].id .* is not a derived id .* at or after 2/,
    )
  })

  it('rejects a label whose identifier was written by hand', () => {
    const base = config()
    const handWritten = [{ ...base.labels[0], id: 'l1deadbeef' }, ...base.labels.slice(1)]
    expect(() => assertDiagramConfig({ ...base, labels: handWritten }, AT)).toThrow(
      `labels[0].id must be the derived id 'l128b13785' but is 'l1deadbeef'`,
    )
  })

  it('rejects a label identifier derived from some other label text', () => {
    const base = config()
    const borrowed = [
      { ...base.labels[0], id: deriveLabelId('Crosswind leg') },
      ...base.labels.slice(1),
    ]
    expect(() => assertDiagramConfig({ ...base, labels: borrowed }, AT)).toThrow(
      /labels\[0\].id must be the derived id/,
    )
  })
})

describe('the answer of a diagram config', () => {
  it('rejects an answer that is not an array', () => {
    expect(() => assertDiagramConfig({ ...config(), answer: 'a' }, AT)).toThrow(
      /answer must be an array/,
    )
  })

  it('rejects an extra field on an answer entry', () => {
    const base = config()
    const annotated = [{ ...base.answer[0], why: 'obvious' }, ...base.answer.slice(1)]
    expect(() => assertDiagramConfig({ ...base, answer: annotated }, AT)).toThrow(
      /unexpected key\(s\) why/,
    )
  })

  it('rejects a blank identifier in an answer entry', () => {
    const base = config()
    const blank = [{ ...base.answer[0], label_id: '  ' }, ...base.answer.slice(1)]
    expect(() => assertDiagramConfig({ ...base, answer: blank }, AT)).toThrow(
      /answer\[0\].label_id must be a non-empty string/,
    )
  })

  it('rejects an answer pointing at a zone the config does not have', () => {
    const base = config()
    const stray = [{ ...base.answer[0], zone_id: 'z1ffffffff' }, ...base.answer.slice(1)]
    expect(() => assertDiagramConfig({ ...base, answer: stray }, AT)).toThrow(
      /answer\[0\].zone_id 'z1ffffffff' names no zone/,
    )
  })

  it('rejects an answer pointing at a label the config does not have', () => {
    const base = config()
    const stray = [{ ...base.answer[0], label_id: 'l1ffffffff' }, ...base.answer.slice(1)]
    expect(() => assertDiagramConfig({ ...base, answer: stray }, AT)).toThrow(
      /answer\[0\].label_id 'l1ffffffff' names no label/,
    )
  })

  it('rejects an answer that leaves a zone unlabelled', () => {
    const base = config()
    expect(() => assertDiagramConfig({ ...base, answer: base.answer.slice(0, 2) }, AT)).toThrow(
      /answer holds 2 entries but there are 3 zones/,
    )
  })

  it('rejects an answer that labels one zone twice', () => {
    const base = config()
    const doubled = [
      base.answer[0],
      { ...base.answer[1], zone_id: base.zones[0].id },
      base.answer[2],
    ]
    expect(() => assertDiagramConfig({ ...base, answer: doubled }, AT)).toThrow(
      `answer zone_id: '${base.zones[0].id}' appears at index 0 and again at index 1`,
    )
  })

  it('rejects an answer that spends one chip on two zones', () => {
    // Consume-on-place: a repeated label leaves the second zone with nothing to fill it.
    const base = config()
    const reused = [
      base.answer[0],
      { ...base.answer[1], label_id: base.labels[0].id },
      base.answer[2],
    ]
    expect(() => assertDiagramConfig({ ...base, answer: reused }, AT)).toThrow(
      `answer label_id: '${base.labels[0].id}' appears at index 0 and again at index 1`,
    )
  })
})
