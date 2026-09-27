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

  it('flags a spec whose beforeEach hook skips unconditionally', () => {
    const source =
      "test.beforeEach(async () => {\n  test.skip(true, 'awaiting fix')\n})\ntest('rejects', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags an argument-less skip in a test whose header wraps across lines', () => {
    const source = "test('rejects a forged token', async ({\n  page,\n}) => {\n  test.skip()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags an unconditional skip whose arguments start on the next line', () => {
    const source =
      "test.describe('forged token flows', () => {\n  test.skip(\n    true,\n    'awaiting fix',\n  )\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag a conditional skip whose arguments start on the next line', () => {
    const source =
      "test('rejects', async ({ browserName }) => {\n  test.skip(\n    browserName === 'webkit',\n  )\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag an unconditional skip inside a wrapped if condition', () => {
    const source =
      "test('rejects', async () => {\n  if (\n    cond\n  ) {\n    test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags an argument-less skip inside a test step', () => {
    const source =
      "test('rejects', async () => {\n  await test.step('log in', async () => {\n    test.skip()\n  })\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag an unconditional skip inside an else branch', () => {
    const source =
      "test('rejects', async () => {\n  if (cond) {\n    await run()\n  } else {\n    test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a conditional untitled skip inside a test body', () => {
    const source =
      "test('rejects', async ({ browserName }) => {\n  test.skip(browserName === 'webkit')\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag an unconditional skip under a braceless if', () => {
    const source = "test('rejects', async () => {\n  if (!process.env.X)\n    test.skip()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a conditional skip after a string holding a brace', () => {
    const source =
      "test('rejects', async () => {\n  if (cond) {\n    const open = '{'\n    test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip behind a short-circuit guard', () => {
    const source = "test('rejects', async () => {\n  cond && test.skip()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip inside a loop', () => {
    const source =
      "test('rejects', async () => {\n  for (const x of xs) {\n    test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip in one arm of a ternary', () => {
    const source = "test('rejects', async () => {\n  cond ? test.skip() : run()\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip in a switch case', () => {
    const source =
      "test('rejects', async () => {\n  switch (mode) {\n    case 'x':\n      test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip in a catch block', () => {
    const source =
      "test('rejects', async () => {\n  try {\n    run()\n  } catch {\n    test.skip()\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a skip that only appears inside a string', () => {
    const source = "test('rejects', async () => {\n  const note = 'test.skip()'\n})"
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

  it('flags a titled skip whose title starts on the next line', () => {
    const source = "test.skip(\n  'rejects a forged token',\n  async () => {},\n)"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('does not flag a conditional skip in a describe body', () => {
    const source =
      "test.describe('forged token flows', () => {\n  test.skip(!process.env.X, 'needs X')\n  test('rejects', async () => {})\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags every row past GAP pointing at a spec that holds any static skip', () => {
    const source = "// Vector QQ\ntest.skip('Vector QQ rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
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
