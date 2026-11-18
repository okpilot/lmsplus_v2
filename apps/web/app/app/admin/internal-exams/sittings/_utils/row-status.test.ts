import { describe, expect, it } from 'vitest'
import { rowStatus } from './row-status'

const ex = (status: string, passed: boolean | null = null, emailed: string | null = null) =>
  ({ entryId: Math.random().toString(), status, passed, codeEmailedAt: emailed }) as never

type St = 'scheduled' | 'open' | 'closed' | 'cancelled'
const rs = (sittingStatus: St, entries: unknown[], deactivated = false) =>
  rowStatus({ sittingStatus, deactivated, entries: entries as never })

describe('rowStatus', () => {
  it('shows Deactivated first, for any sitting status', () => {
    for (const s of ['scheduled', 'open', 'closed'] as const)
      expect(rs(s, [ex('no_code')], true)).toMatchObject({ label: 'Deactivated', tone: 'neutral' })
  })

  it('shows No exams when the person has none', () => {
    expect(rs('scheduled', [])).toMatchObject({ label: 'No exams', tone: 'neutral' })
  })

  it('has no status for a cancelled sitting', () => {
    expect(rs('cancelled', [ex('voided')])).toBeNull()
  })

  describe('scheduled', () => {
    it.each(['no_code', 'expired', 'voided'])('shows Needs codes when an exam is %s', (st) => {
      expect(rs('scheduled', [ex('waiting'), ex(st)])).toMatchObject({
        label: 'Needs codes',
        caption: '1 of 2 have codes',
      })
    })

    it('shows Ready (success) when every code is live, with no Not emailed state', () => {
      expect(
        rs('scheduled', [ex('waiting'), ex('waiting', null, '2026-11-18T08:00:00Z')]),
      ).toMatchObject({
        label: 'Ready',
        tone: 'success',
      })
    })
  })

  describe('open', () => {
    it('shows Absent (danger) when all exams are absent', () => {
      expect(rs('open', [ex('absent'), ex('absent')])).toMatchObject({
        label: 'Absent',
        tone: 'danger',
      })
    })

    it('shows Done (success) with a breakdown that omits zero parts', () => {
      expect(rs('open', [ex('finished'), ex('finished'), ex('absent')])).toMatchObject({
        label: 'Done',
        tone: 'success',
        caption: '2 finished · 1 absent',
      })
    })

    it('shows In progress with a done count when something runs', () => {
      expect(rs('open', [ex('running'), ex('finished'), ex('ready')])).toMatchObject({
        label: 'In progress',
        caption: '1 of 3 done',
      })
    })

    it('shows In progress when some exams are done and others not started', () => {
      expect(rs('open', [ex('finished'), ex('ready')])).toMatchObject({ label: 'In progress' })
    })

    it('counts discarded as done: only-discarded shows Done with its caption', () => {
      expect(rs('open', [ex('discarded')])).toMatchObject({
        label: 'Done',
        tone: 'success',
        caption: '1 discarded',
      })
    })

    it('shows In progress when discarded is done and another exam waits', () => {
      expect(rs('open', [ex('discarded'), ex('waiting')])).toMatchObject({
        label: 'In progress',
        caption: '1 of 2 done',
      })
    })

    it('shows Not started when nothing has started', () => {
      expect(rs('open', [ex('ready'), ex('ready')])).toMatchObject({
        label: 'Not started',
        tone: 'neutral',
      })
    })
  })

  describe('closed', () => {
    it('shows {n} failed (danger) with a breakdown', () => {
      expect(
        rs('closed', [
          ex('finished', true),
          ex('finished', false),
          ex('finished', false),
          ex('absent'),
        ]),
      ).toMatchObject({
        label: '2 failed',
        tone: 'danger',
        caption: '1 passed · 2 failed · 1 absent',
      })
    })

    it('omits the caption when it equals the label', () => {
      const r = rs('closed', [ex('finished', false)])
      expect(r?.label).toBe('1 failed')
      expect(r?.caption).toBeUndefined()
    })

    it('shows All passed (success) when finished and none failed', () => {
      expect(rs('closed', [ex('finished', true), ex('finished', true)])).toMatchObject({
        label: 'All passed',
        tone: 'success',
      })
    })

    it('shows Absent (neutral) when nothing finished', () => {
      expect(rs('closed', [ex('absent')])).toMatchObject({ label: 'Absent', tone: 'neutral' })
    })

    it('shows Attempt discarded when nothing finished and one attempt was discarded', () => {
      expect(rs('closed', [ex('discarded'), ex('absent')])).toMatchObject({
        label: 'Attempt discarded',
        tone: 'neutral',
        caption: '1 absent · 1 discarded',
      })
    })

    it('omits the caption of Attempt discarded when it equals the label', () => {
      expect(rs('closed', [ex('discarded')])?.caption).toBe('1 discarded')
    })

    it('shows All passed with a discarded part when one finished and one was discarded', () => {
      expect(rs('closed', [ex('finished', true), ex('discarded')])).toMatchObject({
        label: 'All passed',
        caption: '1 passed · 1 discarded',
      })
    })

    it('keeps Absent when every exam is absent', () => {
      expect(rs('closed', [ex('absent'), ex('absent')])).toMatchObject({ label: 'Absent' })
    })
  })
})
