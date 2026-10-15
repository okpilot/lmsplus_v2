import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_LABELS, MAX_ZONES } from '@/app/app/quiz/actions/diagram-validation'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc, mockClient, mockCreateClient } = vi.hoisted(() => {
  const mockClient = { marker: 'server-client' }
  return { mockRpc: vi.fn(), mockClient, mockCreateClient: vi.fn(async () => mockClient) }
})

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

const mockVerifySessionUser = vi.fn().mockResolvedValue({ id: 'user-1' })

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: (client: unknown) => mockVerifySessionUser(client),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: () => mockCreateClient(),
}))

// ---- Subject under test ---------------------------------------------------

import { loadSessionQuestions } from './load-session-questions'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockImplementation(async () => mockClient)
})

describe('loadSessionQuestions — diagram_label', () => {
  // Factory for the diagram_label RPC row shape shared by the tests below —
  // varies only id, diagram_config_public, and (rarely) question_text.
  function diagramRow(
    id: string,
    diagramConfigPublic: unknown,
    questionText = 'Label the pattern',
  ) {
    return {
      id,
      question_text: questionText,
      question_image_url: null,
      question_number: null,
      explanation_text: null,
      explanation_image_url: null,
      options: null,
      question_type: 'diagram_label' as const,
      dialog_template: null,
      blanks_safe: null,
      ordering_items_shuffled: null,
      diagram_config_public: diagramConfigPublic,
    }
  }

  it('provides the diagram_config for a diagram_label question', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow(
          'q-diag',
          {
            image_ref: 'rwy-2709-lh-pattern',
            zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.1, h: 0.1 }],
            labels: [
              { id: 'l1', text: 'Upwind' },
              { id: 'l2', text: 'Distractor' },
            ],
          },
          'Label the RWY 27 left-hand pattern',
        ),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag'])
    expect(result.success).toBe(true)
    if (!result.success) return
    const q = result.questions[0]!
    expect(q.question_type).toBe('diagram_label')
    expect(q.diagram_config).toEqual({
      image_ref: 'rwy-2709-lh-pattern',
      zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.1, h: 0.1 }],
      labels: [
        { id: 'l1', text: 'Upwind' },
        { id: 'l2', text: 'Distractor' },
      ],
    })
    expect(q.ordering_items).toBeNull()
  })

  it('strips any extra field the RPC leaks on a diagram zone or label', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.1, h: 0.1, correct: 'l1' }],
          labels: [{ id: 'l1', text: 'Upwind leg', hint: 'z1' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // The reconstruction rebuilds from validated fields only, so a leaked
    // `correct`/`hint` key never reaches the student payload.
    expect(result.questions[0]!.diagram_config).toEqual({
      image_ref: 'rwy-2709-lh-pattern',
      zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.1, h: 0.1 }],
      labels: [{ id: 'l1', text: 'Upwind leg' }],
    })
  })

  it('provides no diagram_config when a diagram_label question omits its public config', async () => {
    mockRpc.mockResolvedValue({
      data: [diagramRow('q-diag-null', null)],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-null'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when image_ref is blank', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-blank-ref', {
          image_ref: '   ',
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-blank-ref'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when a zone falls outside the unit canvas', async () => {
    // The DB CHECK (mig 150) already bounds zone geometry to the [0,1] canvas, but
    // the client guard mirrors it as defense-in-depth against RPC drift: a zone whose
    // box overflows the edge (x + w > 1) must fail closed rather than render off-canvas.
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-oob', {
          image_ref: 'rwy-27-09-lh-pattern',
          zones: [{ id: 'z1', x: 0.95, y: 0.1, w: 0.2, h: 0.1 }],
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-oob'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when zones is empty', async () => {
    // A diagram question always has ≥1 zone (mig 150 CHECK) — an empty zones array
    // is malformed RPC data, fail-closed rather than rendering an unlabeled diagram.
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-no-zones', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [],
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-no-zones'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when a zone element is missing a coordinate', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-bad-zone', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.1 }],
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-bad-zone'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when a zone coordinate is NaN or Infinity', async () => {
    // typeof NaN and typeof Infinity are both 'number', so a typeof-only guard
    // would wrongly admit them — Number.isFinite is required to fail closed.
    const nonFiniteCoords = [Number.NaN, Number.POSITIVE_INFINITY]
    for (const badCoord of nonFiniteCoords) {
      mockRpc.mockResolvedValue({
        data: [
          diagramRow('q-diag-nonfinite', {
            image_ref: 'rwy-2709-lh-pattern',
            zones: [{ id: 'z1', x: badCoord, y: 0.1, w: 0.1, h: 0.1 }],
            labels: [{ id: 'l1', text: 'Upwind' }],
          }),
        ],
        error: null,
      })

      const result = await loadSessionQuestions(['q-diag-nonfinite'])
      expect(result.success).toBe(true)
      if (!result.success) continue
      expect(result.questions[0]!.diagram_config).toBeNull()
    }
  })

  it('discards diagram_config when labels is empty', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-no-labels', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
          labels: [],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-no-labels'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when a label element has a blank text field', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-blank-label', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
          labels: [{ id: 'l1', text: '   ' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-blank-label'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when two zones share the same id', async () => {
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-dup-zone-id', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [
            { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
            { id: 'z1', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
          ],
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-dup-zone-id'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when zones exceeds MAX_ZONES', async () => {
    const zones = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      id: `z${i}`,
      x: 0.1,
      y: 0.1,
      w: 0.05,
      h: 0.05,
    }))
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-too-many-zones', {
          image_ref: 'rwy-2709-lh-pattern',
          zones,
          labels: [{ id: 'l1', text: 'Upwind' }],
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-too-many-zones'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })

  it('discards diagram_config when labels exceeds MAX_LABELS', async () => {
    const labels = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({
      id: `l${i}`,
      text: `Label ${i}`,
    }))
    mockRpc.mockResolvedValue({
      data: [
        diagramRow('q-diag-too-many-labels', {
          image_ref: 'rwy-2709-lh-pattern',
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
          labels,
        }),
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-diag-too-many-labels'])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]!.diagram_config).toBeNull()
  })
})
