import { describe, expect, it } from 'vitest'
import { DiagramMappingSchema, diagramIdSchema } from './diagram-mapping-schema'
import { isDiagramId, MAX_ZONES } from './diagram-validation'

const valid = [
  { zoneId: 'z1', labelId: 'l1' },
  { zoneId: 'z2', labelId: 'l2' },
]

describe('DiagramMappingSchema', () => {
  it('accepts a well-formed mapping', () => {
    expect(DiagramMappingSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an empty mapping', () => {
    expect(DiagramMappingSchema.safeParse([]).success).toBe(false)
  })

  it('rejects a mapping with more placements than zones allowed', () => {
    const tooMany = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      zoneId: `z${i}`,
      labelId: `l${i}`,
    }))
    expect(DiagramMappingSchema.safeParse(tooMany).success).toBe(false)
  })

  it('rejects a mapping that places two labels in the same zone', () => {
    const dup = [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z1', labelId: 'l2' },
    ]
    expect(DiagramMappingSchema.safeParse(dup).success).toBe(false)
  })

  it('rejects a mapping that uses one label in two zones', () => {
    const dup = [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l1' },
    ]
    expect(DiagramMappingSchema.safeParse(dup).success).toBe(false)
  })

  it('rejects an entry with an unexpected extra key', () => {
    expect(
      DiagramMappingSchema.safeParse([{ zoneId: 'z1', labelId: 'l1', extra: 1 }]).success,
    ).toBe(false)
  })

  it('rejects a whitespace-only id', () => {
    expect(DiagramMappingSchema.safeParse([{ zoneId: '   ', labelId: 'l1' }]).success).toBe(false)
  })

  it('rejects a 201-character id', () => {
    const id = 'a'.repeat(201)
    expect(DiagramMappingSchema.safeParse([{ zoneId: id, labelId: 'l1' }]).success).toBe(false)
  })

  it('accepts a padded id and trims it', () => {
    const result = DiagramMappingSchema.safeParse([{ zoneId: '  z1  ', labelId: 'l1' }])
    expect(result.success).toBe(true)
    expect(result.data?.[0]?.zoneId).toBe('z1')
  })
})

describe('diagram id guard and schema agreement', () => {
  const inputs: unknown[] = [
    '',
    '  ',
    '\t',
    '\n',
    ' \n ',
    '\u00a0',
    'a',
    'a'.repeat(200),
    'a'.repeat(201),
    ` ${'a'.repeat(200)} `,
    '😀'.repeat(101),
    '😀'.repeat(200),
    '😀'.repeat(201),
    ` ${'😀'.repeat(200)} `,
    '\ud800'.repeat(201),
    123,
    null,
    undefined,
  ]

  it.each(inputs)('accepts and rejects %j the same in the runtime guard and the schema', (x) => {
    expect(isDiagramId(x)).toBe(diagramIdSchema.safeParse(x).success)
  })
})
