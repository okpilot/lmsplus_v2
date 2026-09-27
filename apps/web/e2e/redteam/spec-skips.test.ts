import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { VALID_ROW } from './matrix-fixtures'
import { skippedSpecRowIds } from './spec-skips'

const REDTEAM_DIR = path.resolve(__dirname)

describe('skippedSpecRowIds', () => {
  const skipped = "test.skip('rejects a forged token', async () => {})"
  const running = "test('rejects a forged token', async () => {})"
  const blockedRow = () => [...VALID_ROW].fill('BLOCKED', 4, 5)

  it('flags a BLOCKED row whose spec is still skipped', () => {
    expect(skippedSpecRowIds([blockedRow()], () => skipped)).toEqual(['ZZ'])
  })

  it('accepts a BLOCKED row whose spec runs', () => {
    expect(skippedSpecRowIds([blockedRow()], () => running)).toEqual([])
  })

  it('accepts a GAP row whose spec is skipped', () => {
    expect(skippedSpecRowIds([[...VALID_ROW].fill('GAP', 4, 5)], () => skipped)).toEqual([])
  })

  it('does not flag a spec that only mentions test.skip() in a comment', () => {
    const source =
      'test.beforeEach(async () => {\n  // reset id so a test.skip() below does not leak\n})'
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a spec with a conditional runtime test.skip', () => {
    const source =
      "test('rejects a forged token', async () => {\n  if (cond) {\n    test.skip(true, 'reason')\n    return\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags a spec whose describe body skips every test unconditionally', () => {
    const source =
      "test.describe('forged token flows', () => {\n  test.skip(true, 'awaiting fix')\n  test('rejects', async () => {})\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a spec whose describe body calls an argument-less skip', () => {
    const source = "test.describe('forged token flows', () => {\n  test.skip()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a spec whose test body skips unconditionally', () => {
    const source =
      "test('rejects a forged token', async ({ page }) => {\n  test.skip(true, 'awaiting fix')\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a spec whose test body calls an argument-less skip', () => {
    const source = "test('rejects a forged token', async () => {\n  test.skip()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag a conditional untitled skip inside a test body', () => {
    const source =
      "test('rejects', async ({ browserName }) => {\n  test.skip(browserName === 'webkit')\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags a spec with a titled test.skip', () => {
    const source = "test.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a spec with a titled test.describe.skip', () => {
    const source = "test.describe.skip('forged token flows', () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a skip attributed to this row by a preceding Vector comment', () => {
    const source = "// Vector ZZ\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag a skip attributed to a different vector', () => {
    const source = "// Vector QQ\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags a skip whose Vector comment names this row among several vectors', () => {
    const source = "// Vector QQ / Vector ZZ\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags an unattributed skip', () => {
    const source = "// resets fixture state\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a skip whose comment lists this row after another ID', () => {
    const source = "// Vector QQ, ZZ\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a skip whose plural Vectors comment names this row', () => {
    const source = "// Vectors QQ and ZZ\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not attribute a skip through an issue reference after the ID', () => {
    const source = "// Vector QQ, #384\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags a skip whose comment mentions Vectors without naming an ID', () => {
    const source =
      "// Vectors below need a seeded admin\ntest.describe.skip('forged token flows', () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('attributes a skip by the Vector ID in its own title over the line above', () => {
    const source = "// Vector QQ\ntest.skip('Vector ZZ rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag a row when the skipped title names a different vector', () => {
    const source = "})\ntest.skip('Vector QQ rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a conditional skip in a describe body', () => {
    const source =
      "test.describe('forged token flows', () => {\n  test.skip(!process.env.X, 'needs X')\n  test('rejects', async () => {})\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not let a Vector comment for a longer ID match a shorter row ID', () => {
    const row = [...VALID_ROW]
    row[0] = 'F'
    row[4] = 'BLOCKED'
    const source = "// Vector FW\ntest.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([row], () => source)).toEqual([])
  })

  it('skips a row whose spec file does not exist instead of throwing', () => {
    expect(() =>
      skippedSpecRowIds(
        [blockedRow()],
        (name) => fs.readFileSync(path.join(REDTEAM_DIR, name), 'utf8'),
        () => false,
      ),
    ).not.toThrow()
    expect(
      skippedSpecRowIds(
        [blockedRow()],
        (name) => fs.readFileSync(path.join(REDTEAM_DIR, name), 'utf8'),
        () => false,
      ),
    ).toEqual([])
  })
})
