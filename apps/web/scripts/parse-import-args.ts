/**
 * Argv parsing for scripts/import-questions.ts, extracted so it can be tested at all: that file
 * has ZERO exports and INVOKES `main()` at module scope (last line, no `require.main` guard), so
 * merely importing it runs the whole importer. Under Vitest that reaches `parseArgs`'s
 * `process.exit(1)` — argv carries no `--file` — and kills the worker. The same reason
 * `replace-planning.ts` exists.
 *
 * (An earlier draft of this paragraph said the file "builds a Supabase client at module load" and
 * "opens a real connection". Both false: `createAdminClient` is called inside `main()`, well after
 * `parseArgs`, and supabase-js opens nothing at construction. The module-scope `main()` call is
 * the real reason and a stronger one.)
 *
 * Worth extracting because the branching here is genuinely fiddly. Two INDEPENDENT `if`s over a
 * hoisted `next` can pair a flag with a value a previous branch already consumed, because the
 * first branch advances `i` and the second then tests the new `args[i]` against the stale `next`.
 * `else if` makes the branches mutually exclusive so that cannot arise.
 *
 * Note what this does NOT claim: with only two flags the buggy form was not reachable in a way
 * that changed the outcome — `--file --base-dir /d` sets `file` to `'--base-dir'` either way, and
 * the run dies on that filename before `baseDir` is read. A flag-shaped VALUE is still consumed
 * as a value (`--base-dir --file x` yields `baseDir: '--file'`) in both forms; rejecting that is
 * a separate decision this parser deliberately does not make, since a path may legitimately
 * begin with a dash. The `else if` guards the third flag nobody has added yet.
 */
export type ImportArgs = { file: string; baseDir: string }

export function parseImportArgs(argv: readonly string[]): ImportArgs {
  let file = ''
  let baseDir = ''
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1]
    if (argv[i] === '--file' && next) {
      file = next
      i++
    } else if (argv[i] === '--base-dir' && next) {
      baseDir = next
      i++
    }
  }
  return { file, baseDir }
}
