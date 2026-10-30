import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = path.resolve(ROOT, '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const A = 'app/app/'
const Q = `${A}quiz/`
const S = `${Q}session/_components/`

describe('B2b-12 AC 3 input consumers', () => {
  it('short answer uses a large Input', () => {
    const s = src(`${S}short-answer-input.tsx`)
    expect(s).toMatch(/<Input[^>]*size="lg"/)
  })
  it('dialog blank uses a small Input and keeps its hooks', () => {
    const s = src(`${S}dialog-blank.tsx`)
    expect(s).toMatch(/<Input[^>]*size="sm"/)
    expect(s).toContain('dialog-blank-input')
    expect(s).toContain('--blank-w')
    expect(s).toContain('border-success')
    expect(s).toContain('border-danger')
  })
})

describe('B2b-12 AC 4 drag look', () => {
  it('ordering rows are rounded-control p-3 with a lifted dragged row', () => {
    const s = src(`${S}ordering-input-item.tsx`)
    expect(s).toContain('rounded-control')
    expect(s).toContain('p-3')
    expect(s).toContain('hover:bg-muted')
    expect(s).toContain('border-primary')
    expect(s).toContain('shadow-raised')
    expect(s).not.toMatch(/opacity-\d|opacity:/)
  })
})

describe('B2b-12 AC 5 phone diagram', () => {
  it('tap-list module exists and the drag path is deleted', () => {
    expect(existsSync(path.join(ROOT, `${S}diagram-tap-list.tsx`))).toBe(true)
  })
  it.each([
    `${S}diagram-label-zone.tsx`,
    `${S}diagram-label-zone.test.tsx`,
    `${S}diagram-label-chip.tsx`,
    `${S}diagram-label-chip.test.tsx`,
    `${S}diagram-label-pool.tsx`,
    `${S}diagram-label-pool.test.tsx`,
    `${Q}session/_hooks/use-media-query.ts`,
    `${Q}session/_hooks/use-media-query.test.tsx`,
  ])('%s is deleted', (f) => {
    expect(existsSync(path.join(ROOT, f))).toBe(false)
  })
  it('biome.json has no override for the deleted chip', () => {
    expect(readFileSync(path.join(REPO, 'biome.json'), 'utf8')).not.toContain('diagram-label-chip')
  })
  it('tap UI uses no raw button', () => {
    expect(src(`${S}diagram-tap-list.tsx`)).not.toMatch(/<button[\s>]/)
  })
})

describe('B2b-12 AC 6 tabs at 320', () => {
  it('tightens gap and text below 375px', () => {
    const s = src(`${Q}_components/question-tabs.tsx`)
    expect(s).toContain('max-[374.98px]:gap-0')
    expect(s).toContain('max-[374.98px]:text-caption')
  })
})

describe('B2b-12 AC 7 setup order', () => {
  const FORMS = [
    `${Q}_components/quiz-config-form.tsx`,
    `${Q}_components/study-config-form.tsx`,
    `${A}vfr-rt/_components/vfr-rt-config-form.tsx`,
  ]
  for (const f of FORMS) {
    it(`${path.basename(f)} places the tree before Start in the DOM and on a lg grid`, () => {
      const s = src(f)
      expect(s.indexOf('<TopicTree')).toBeGreaterThan(-1)
      expect(s.indexOf('<TopicTree')).toBeLessThan(s.indexOf('<StartButton'))
      expect(s).toContain('lg:grid-rows-(--layout-setup-rows)')
      expect(s).toContain('lg:row-span-2')
      expect(s).toContain('lg:sticky')
    })
  }
  it('declares --layout-setup-rows as auto 1fr', () => {
    expect(src('lib/design/scale.ts')).toMatch(/'layout-setup-rows':\s*'auto 1fr'/)
  })
})

describe('B2b-12 AC 8 popover consumers', () => {
  it('popover primitive exists and carries the overlay look', () => {
    const s = src('components/ui/popover.tsx')
    expect(s).toContain('@base-ui/react/popover')
    expect(s).toContain('ring-1 ring-border')
    expect(s).toContain('shadow-raised')
    expect(s).toContain('bg-popover')
  })
  it('keyboard legend, filter hint and info tooltip use Popover', () => {
    for (const f of [
      `${S}keyboard-legend.tsx`,
      `${Q}_components/question-filter-toggles.tsx`,
      `${A}dashboard/_components/info-tooltip.tsx`,
    ]) {
      expect(src(f), f).toContain('@/components/ui/popover')
    }
    expect(src(`${S}keyboard-legend.tsx`)).not.toContain('keydown')
  })
})

describe('B2b-12 AC 9 finish dialog', () => {
  it('uses DialogContent with the scrim overlay override', () => {
    const s = src(`${Q}_components/finish-quiz-dialog.tsx`)
    expect(s).toContain('DialogContent')
    expect(s).not.toContain('DialogPrimitive.Popup')
    expect(s).toContain('overlayClassName')
    expect(s).toContain('showCloseButton={false}')
    expect(s).toContain('initialFocus')
    expect(s).toContain('disablePointerDismissal')
  })
})

describe('B2b-12 AC 10 session skeleton', () => {
  it('uses the session grid with a rail card', () => {
    const s = src(`${Q}session/[id]/loading.tsx`)
    expect(s).toContain('<QuizSessionLayout')
  })
})

describe('B2b-12 AC 2 upload field', () => {
  it('no raw max-w-xs on the image upload field', () => {
    expect(src(`${A}admin/questions/_components/image-upload-field.tsx`)).not.toContain('max-w-xs')
  })
})

describe('B2b-12 AC 11 decision 189', () => {
  const d = readFileSync(path.join(REPO, 'docs/decisions.md'), 'utf8')
  const line = d.split('\n').find((l) => l.startsWith('## 189 ')) ?? ''
  it('is appended with the phone clause', () => {
    expect(line).not.toBe('')
    expect(line).toContain(
      'the diagram question is numbered zones and a tap-to-place list on every screen',
    )
    expect(line).toContain('question tabs tighten below 375px')
    expect(line).toContain('below 1024px the setup forms put topics before Start')
    expect(line).toContain('#1433')
    expect(line).toContain('hints open on hover, click and tap, the keyboard legend on click')
    expect(line).not.toContain('target zone')
  })
})
