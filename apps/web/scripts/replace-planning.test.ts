import { describe, expect, it } from 'vitest'
import { decideUnaccounted, planReplace, planScope } from './replace-planning'

describe('planReplace', () => {
  it('updates a question in place when its number is already live', () => {
    const plan = planReplace({ fileNums: ['DLG-01'], liveNums: ['DLG-01'] })
    expect(plan.toUpdate).toEqual(['DLG-01'])
    expect(plan.toInsert).toEqual([])
    expect(plan.orphaned).toEqual([])
  })

  it('inserts a question that is authored but not yet live', () => {
    const plan = planReplace({ fileNums: ['DLG-05'], liveNums: [] })
    expect(plan.toInsert).toEqual(['DLG-05'])
    expect(plan.toUpdate).toEqual([])
  })

  it('lists a live number the file no longer declares', () => {
    const plan = planReplace({ fileNums: ['DLG-01'], liveNums: ['DLG-01', 'DLG-04'] })
    expect(plan.orphaned).toEqual(['DLG-04'])
  })

  it('does not flag a live question still declared by the file as orphaned', () => {
    const plan = planReplace({ fileNums: ['DLG-01', 'DLG-04'], liveNums: ['DLG-01', 'DLG-04'] })
    expect(plan.orphaned).toEqual([])
  })

  it('reproduces the reported symptom: numbers dropped from the file are listed, not left silently live', () => {
    // 2026-08-15 (#1191): DLG-04 and DLG-22 were removed from the file; the pool stayed at 52
    // active rows against a 50-question file until they were soft-deleted by hand. The fixture is
    // built from those numbers so the data matches the incident it cites — the removals are
    // MID-range, which a tail-range fixture would not represent.
    const liveNums = Array.from({ length: 52 }, (_, i) => `DLG-${String(i + 1).padStart(2, '0')}`)
    const fileNums = liveNums.filter((n) => n !== 'DLG-04' && n !== 'DLG-22')
    const plan = planReplace({ fileNums, liveNums })
    expect(plan.orphaned).toEqual(['DLG-04', 'DLG-22'])
    expect(plan.toUpdate).toHaveLength(50)
  })

  it('handles a first import where nothing is live yet', () => {
    const plan = planReplace({ fileNums: ['DLG-01', 'DLG-02'], liveNums: [] })
    expect(plan.toInsert).toEqual(['DLG-01', 'DLG-02'])
    expect(plan.toUpdate).toEqual([])
    expect(plan.orphaned).toEqual([])
  })

  it('produces all three outcomes at once for a run that edits, adds, and removes questions', () => {
    const plan = planReplace({
      fileNums: ['DLG-01', 'DLG-02', 'DLG-05'],
      liveNums: ['DLG-01', 'DLG-02', 'DLG-04'],
    })
    expect(plan.toUpdate).toEqual(['DLG-01', 'DLG-02'])
    expect(plan.toInsert).toEqual(['DLG-05'])
    expect(plan.orphaned).toEqual(['DLG-04'])
  })

  it('treats an empty file and no live rows as a no-op', () => {
    const plan = planReplace({ fileNums: [], liveNums: [] })
    expect(plan).toEqual({ toUpdate: [], toInsert: [], orphaned: [] })
  })
})

describe('planScope', () => {
  // The real shape that caused the defect: three Part 3 MC files, one P3_MC/multiple_choice
  // scope, disjoint number prefixes. COUNTS match the shipped corpus (20 / 11 / 5); the number
  // format is simplified (VRT-P3-MC-1, corpus uses VRT-P3-MC-01) — planScope is set-based.
  const NUMBERS = {
    rel: 'mc-numbers.json',
    nums: Array.from({ length: 20 }, (_, i) => `VRT-P3-MC-${i + 1}`),
  }
  const EMERGENCY = {
    rel: 'mc-emergency.json',
    nums: Array.from({ length: 11 }, (_, i) => `VRT-P3-EMC-${i + 1}`),
  }
  const POSREP = {
    rel: 'mc-posrep.json',
    nums: Array.from({ length: 5 }, (_, i) => `VRT-P3-PMC-${i + 1}`),
  }
  const ALL_LIVE = [...NUMBERS.nums, ...EMERGENCY.nums, ...POSREP.nums]

  it('does not treat a sibling file sharing the scope as removed content', () => {
    const plan = planScope({ files: [NUMBERS, EMERGENCY, POSREP], liveNums: ALL_LIVE })
    expect(plan.unaccounted).toEqual([])
    expect(plan.perFile.get('mc-numbers.json')?.toUpdate).toHaveLength(20)
    expect(plan.perFile.get('mc-emergency.json')?.toUpdate).toHaveLength(11)
  })

  it('reports every sibling row as unaccounted when only one of the files is given', () => {
    // The regression: re-importing mc-numbers.json alone used to soft-delete these 16 and exit 0.
    const plan = planScope({ files: [NUMBERS], liveNums: ALL_LIVE })
    expect(plan.unaccounted).toEqual([...EMERGENCY.nums, ...POSREP.nums])
    expect(plan.unaccounted).toHaveLength(16)
  })

  it('never puts a number in one file to update and another file to remove at once', () => {
    const plan = planScope({ files: [NUMBERS, EMERGENCY, POSREP], liveNums: ALL_LIVE })
    const updating = new Set([...plan.perFile.values()].flatMap((p) => p.toUpdate))
    expect(plan.unaccounted.filter((n) => updating.has(n))).toEqual([])
  })

  it('names a question dropped from the content, which is the case pruning exists for', () => {
    const trimmed = { rel: 'mc-numbers.json', nums: NUMBERS.nums.slice(0, 18) }
    const plan = planScope({ files: [trimmed, EMERGENCY, POSREP], liveNums: ALL_LIVE })
    expect(plan.unaccounted).toEqual(['VRT-P3-MC-19', 'VRT-P3-MC-20'])
  })

  it('plans a first import as all inserts with nothing to remove', () => {
    const plan = planScope({ files: [NUMBERS], liveNums: [] })
    expect(plan.perFile.get('mc-numbers.json')?.toInsert).toHaveLength(20)
    expect(plan.unaccounted).toEqual([])
  })
})

describe('decideUnaccounted', () => {
  it('does nothing when every live row is authored by some file in the run', () => {
    expect(decideUnaccounted({ unaccounted: [], prune: false })).toBe('noop')
    expect(decideUnaccounted({ unaccounted: [], prune: true })).toBe('noop')
  })

  it('refuses to delete rows no file claims unless deletion was asked for', () => {
    expect(decideUnaccounted({ unaccounted: ['VRT-P3-EMC-1'], prune: false })).toBe('abort')
  })

  it('deletes rows no file claims once deletion is asked for', () => {
    expect(decideUnaccounted({ unaccounted: ['VRT-P3-EMC-1'], prune: true })).toBe('prune')
  })
})
