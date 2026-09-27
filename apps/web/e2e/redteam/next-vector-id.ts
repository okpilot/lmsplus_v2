/**
 * CLI: prints the next unallocated vector ID for attack-surface.md.
 * `pnpm --filter @repo/web exec tsx e2e/redteam/next-vector-id.ts <IDs already allocated this run>`
 * Fails closed: any git/read failure, or zero IDs parsed from EITHER matrix, exits 1.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertVectorIds, extractIds, nextVectorId, parseMatrixRows } from './matrix'

const MATRIX_PATH = resolve(__dirname, 'attack-surface.md')

function readOriginMasterMatrix(): string {
  execFileSync('git', ['fetch', 'origin', 'master'], { stdio: 'pipe' })
  return execFileSync('git', ['show', 'origin/master:apps/web/e2e/redteam/attack-surface.md'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function main(): void {
  const allocated = process.argv.slice(2)
  assertVectorIds(allocated)
  const originMarkdown = readOriginMasterMatrix()
  const workingTreeMarkdown = readFileSync(MATRIX_PATH, 'utf8')
  const originIds = extractIds(parseMatrixRows(originMarkdown))
  const workingTreeIds = extractIds(parseMatrixRows(workingTreeMarkdown))
  if (originIds.length === 0 || workingTreeIds.length === 0) {
    throw new Error('next-vector-id: zero IDs parsed from origin/master or working-tree matrix')
  }
  console.log(nextVectorId([originIds, workingTreeIds, allocated]))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
