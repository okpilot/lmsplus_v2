// Tests for pr-head-files.mjs. No network I/O — main() runs against a stubbed fetch.
// Run: node --test .github/scripts/pr-head-files.test.mjs

import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { indexLines, main, safePath, selectPatchless } from './pr-head-files.mjs'

// ---------------------------------------------------------------- selectPatchless

test('selectPatchless skips a removed file even with no patch', () => {
  const files = [{ filename: 'gone.ts', status: 'removed', patch: undefined }]
  assert.deepEqual(selectPatchless(files), [])
})

test('selectPatchless skips a file that carries a patch', () => {
  const files = [{ filename: 'a.ts', status: 'modified', patch: '@@ -1 +1 @@' }]
  assert.deepEqual(selectPatchless(files), [])
})

test('selectPatchless selects a modified file with no patch field', () => {
  const files = [{ filename: 'big.ts', status: 'modified' }]
  assert.deepEqual(selectPatchless(files), ['big.ts'])
})

test('selectPatchless selects a file whose patch is explicitly null', () => {
  const files = [{ filename: 'binary.png', status: 'added', patch: null }]
  assert.deepEqual(selectPatchless(files), ['binary.png'])
})

test('selectPatchless uses the new filename for a rename', () => {
  const files = [{ filename: 'new/path.ts', previous_filename: 'old/path.ts', status: 'renamed' }]
  assert.deepEqual(selectPatchless(files), ['new/path.ts'])
})

test('selectPatchless returns nothing for an empty file list', () => {
  assert.deepEqual(selectPatchless([]), [])
})

// ---------------------------------------------------------------- safePath

test('safePath rejects an absolute path', () => {
  assert.equal(safePath('/etc/passwd'), 'absolute path')
})

test('safePath rejects a .. path segment', () => {
  assert.equal(safePath('a/../../etc/passwd'), '.. path segment')
})

test('safePath rejects a .git/ path', () => {
  assert.equal(safePath('.git/config'), '.git/ path')
})

test('safePath accepts a normal nested path', () => {
  assert.equal(safePath('apps/web/app/app/quiz/page.tsx'), null)
})

// ---------------------------------------------------------------- indexLines

test('indexLines lists fetched and not-fetched paths with their reason', () => {
  const results = [
    { path: 'a.ts', fetched: true, file: 'f/1' },
    { path: 'b.ts', fetched: false, reason: 'http 404' },
  ]
  assert.deepEqual(indexLines(results, false), [
    'fetched a.ts → f/1',
    'not-fetched b.ts — http 404',
  ])
})

test('indexLines appends a truncated line when the file list was capped', () => {
  assert.deepEqual(indexLines([{ path: 'a.ts', fetched: true, file: 'f/1' }], true), [
    'fetched a.ts → f/1',
    'truncated',
  ])
})

test('indexLines escapes a newline in a path so one filename cannot forge a second line', () => {
  const results = [
    { path: 'decoy.ts\nfetched payload.bin', fetched: true, file: 'f/1' },
    { path: 'payload.bin', fetched: false, reason: 'http 403' },
  ]
  assert.deepEqual(indexLines(results, false), [
    'fetched decoy.ts\\x0afetched payload.bin → f/1',
    'not-fetched payload.bin — http 403',
  ])
})

test('indexLines returns nothing for an empty, untruncated result set', () => {
  assert.deepEqual(indexLines([], false), [])
})

// ---------------------------------------------------------------- main (I/O, fetch stubbed)

const TEST_ENV = {
  GH_TOKEN: 'test-token',
  REPO: 'okpilot/lmsplus_v2',
  PR_NUMBER: '42',
  HEAD_SHA: 'deadbeef',
}

/** Runs `run(sandbox)` in a fresh cwd with `fetch` stubbed and `TEST_ENV` set; restores and
 *  removes everything after. */
async function withMainSandbox(fetchImpl, run) {
  const sandbox = await mkdtemp(join(tmpdir(), 'pr-head-files-test-'))
  const origCwd = process.cwd()
  const origFetch = globalThis.fetch
  const origEnv = Object.fromEntries(Object.keys(TEST_ENV).map((k) => [k, process.env[k]]))
  Object.assign(process.env, TEST_ENV)
  process.chdir(sandbox)
  globalThis.fetch = fetchImpl
  try {
    return await run(sandbox)
  } finally {
    globalThis.fetch = origFetch
    process.chdir(origCwd)
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(sandbox, { recursive: true, force: true })
  }
}

async function readGeneratedIndex(sandbox) {
  return readFile(join(sandbox, '.pr-head', 'INDEX.txt'), 'utf8')
}

test('main marks the index truncated when the file list fills every page up to the cap', async () => {
  let pageCount = 0
  const index = await withMainSandbox(
    async () => {
      pageCount++
      // patch present on every entry so selectPatchless drops them all — this test is only
      // about pagination/truncation, not the per-file fetch path.
      const page = Array.from({ length: 100 }, (_, i) => ({
        filename: `f-${pageCount}-${i}.ts`,
        status: 'modified',
        patch: '@@ -1 +1 @@',
      }))
      return { ok: true, json: async () => page }
    },
    async (sandbox) => {
      await main()
      return readGeneratedIndex(sandbox)
    },
  )
  assert.equal(pageCount, 30)
  assert.equal(index, 'truncated\n')
})

test('main does not mark the index truncated once a page returns fewer than the page size', async () => {
  let pageCount = 0
  const index = await withMainSandbox(
    async () => {
      pageCount++
      const length = pageCount === 1 ? 100 : 40
      const page = Array.from({ length }, (_, i) => ({
        filename: `g-${pageCount}-${i}.ts`,
        status: 'modified',
        patch: '@@ -1 +1 @@',
      }))
      return { ok: true, json: async () => page }
    },
    async (sandbox) => {
      await main()
      return readGeneratedIndex(sandbox)
    },
  )
  assert.equal(pageCount, 2)
  assert.equal(index, '\n')
})

test('main records the http status when a per-file fetch returns a non-2xx response', async () => {
  const index = await withMainSandbox(
    async (url) => {
      if (url.includes('/pulls/')) {
        return { ok: true, json: async () => [{ filename: 'big.bin', status: 'added' }] }
      }
      return { ok: false, status: 404 }
    },
    async (sandbox) => {
      await main()
      return readGeneratedIndex(sandbox)
    },
  )
  assert.equal(index, 'not-fetched big.bin — http 404\n')
})

test('main records the error message when a per-file fetch throws', async () => {
  const index = await withMainSandbox(
    async (url) => {
      if (url.includes('/pulls/')) {
        return { ok: true, json: async () => [{ filename: 'flaky.ts', status: 'modified' }] }
      }
      throw new Error('network down')
    },
    async (sandbox) => {
      await main()
      return readGeneratedIndex(sandbox)
    },
  )
  assert.equal(index, 'not-fetched flaky.ts — error: network down\n')
})

test('main treats a JSON content response as not a plain file, not as fetched', async () => {
  const index = await withMainSandbox(
    async (url) => {
      if (url.includes('/pulls/')) {
        return { ok: true, json: async () => [{ filename: 'submodule-dir', status: 'added' }] }
      }
      return { ok: true, headers: { get: () => 'application/json; charset=utf-8' } }
    },
    async (sandbox) => {
      await main()
      return readGeneratedIndex(sandbox)
    },
  )
  assert.equal(index, 'not-fetched submodule-dir — not a plain file (submodule or directory)\n')
})

test('main rejects when the pull-request files list itself cannot be fetched', async () => {
  await withMainSandbox(
    async () => ({ ok: false, status: 500 }),
    async () => {
      await assert.rejects(main(), /pulls\/files page 1 failed: 500/)
    },
  )
})

test('main encodes each path segment, leaving slashes intact, when requesting a head copy', async () => {
  let requestedUrl
  await withMainSandbox(
    async (url) => {
      if (url.includes('/pulls/')) {
        return {
          ok: true,
          json: async () => [{ filename: 'dir with space/file (1).ts', status: 'modified' }],
        }
      }
      requestedUrl = url
      return { ok: false, status: 404 }
    },
    async () => {
      await main()
    },
  )
  assert.equal(
    requestedUrl,
    'https://api.github.com/repos/okpilot/lmsplus_v2/contents/dir%20with%20space/file%20(1).ts?ref=deadbeef',
  )
})

test('main writes each fetched head copy to a numbered file and maps its path in the index', async () => {
  const result = await withMainSandbox(
    async (url) => {
      if (url.includes('/pulls/')) {
        return {
          ok: true,
          json: async () => [
            { filename: 'nested/CLAUDE.md', status: 'modified' },
            { filename: 'INDEX.txt', status: 'added' },
          ],
        }
      }
      return {
        ok: true,
        headers: { get: () => 'application/octet-stream' },
        arrayBuffer: async () => new TextEncoder().encode('binary-content').buffer,
      }
    },
    async (sandbox) => {
      await main()
      const index = await readGeneratedIndex(sandbox)
      const content = await readFile(join(sandbox, '.pr-head', 'files', '1'), 'utf8')
      const entries = await readdir(join(sandbox, '.pr-head'))
      return { index, content, entries }
    },
  )
  assert.equal(
    result.index,
    'fetched nested/CLAUDE.md → .pr-head/files/1\nfetched INDEX.txt → .pr-head/files/2\n',
  )
  assert.equal(result.content, 'binary-content')
  assert.deepEqual(result.entries.sort(), ['INDEX.txt', 'files'])
})
