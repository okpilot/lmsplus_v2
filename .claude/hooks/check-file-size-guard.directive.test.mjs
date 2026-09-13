// Unit tests for `declaresUseServer` — the file-size guard's Server Action classifier.
// Split out of `check-file-size-guard.test.mjs` when adding the multi-entry prologue case put
// that file inside the same-commit extraction trigger in code-style.md §1. CI runs each suite
// by explicit path, so this file needs its own step in `.github/workflows/ci.yml` — a test file
// nothing runs certifies its mechanism unconditionally.
// Run:
//   node --test .claude/hooks/check-file-size-guard.directive.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs and that case — or the named GROUP of cases sharing it — goes red.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { declaresUseServer } from './check-file-size-guard.mjs'

// ---------------------------------------------------------- declaresUseServer

test('a header comment DENYING the use server directive is not a declaration', () => {
  // MUTATION: unanchor the regex (drop ^\s*) → this matches and two real helper files
  // (resume-helpers.ts, load-draft-helpers.ts) get misread as Server Actions. Those
  // files exist BECAUSE someone split a file to obey this rule; flagging them inverts
  // the finding. This is a real false positive that occurred during scoping.
  const denial = "// Hoisted out of resume.ts. No `'use server'` — these are pure transforms.\n"
  assert.equal(declaresUseServer(denial), false)
})

test('recognises the directive in single or double quotes at line start', () => {
  assert.equal(declaresUseServer("'use server'\nimport x\n"), true)
  assert.equal(declaresUseServer('"use server"\nimport x\n'), true)
})

test('a block comment whose line begins with the directive is not a declaration', () => {
  // MUTATION: restore `/^\s*['"]use server['"]/m` → this matches and a 200-line utility takes
  // the 100-line Server Action cap. The line-start anchor that fixed the DENIAL case above did
  // not fix this one: `/m` re-anchors on every line, including the inside of a block comment.
  // A directive is only a directive in the prologue, so the scan skips comments and whitespace
  // and requires the directive to be what comes next.
  const block =
    "/*\n 'use server' is deliberately absent — these are pure transforms.\n*/\nexport const x = 1\n"
  assert.equal(declaresUseServer(block), false)
  // The prologue itself still reads through comments to a real directive.
  assert.equal(declaresUseServer("/* header */\n\n'use server'\nimport y\n"), true)
  // ...and a directive AFTER a statement is not a prologue directive.
  assert.equal(declaresUseServer("export const a = 1\n'use server'\n"), false)
})

test('a BOM or CR in the prologue is skipped like any other whitespace', () => {
  // MUTATION: drop `c === '\r'` (or `'﻿'`) from the whitespace set → a CRLF-authored
  // file, or one saved with a UTF-8 BOM, falls to the else branch on that character and
  // slices the wrong 12-char window, missing a real directive that follows it.
  assert.equal(declaresUseServer("﻿\r\n'use server'\nimport x\n"), true)
})

test('an unterminated block comment leaves no reachable prologue', () => {
  // MUTATION: `if (end === -1) return true` → red. Named that way deliberately: DELETING the
  // guard instead leaves this case green, because `i` then resets to `end + 2 === 1`, which for
  // a comment opening at index 0 is its own `*` — one extra pass, the same `false`, nothing to
  // see. Shift the opening by one character and the same deletion HANGS rather than answering
  // wrong: `i` resets to the `/` it just came from, forever. So the guard's real job is
  // TERMINATION, and the second assertion below is the input that proves it — a test cannot
  // usefully assert a hang, it can only decline to hang.
  assert.equal(declaresUseServer('/* never closed\nexport const x = 1\n'), false)
  assert.equal(declaresUseServer(' /* never closed, opened at index 1\n'), false)
})

test('a use server directive that is the SECOND prologue entry still counts', () => {
  // MUTATION: return false instead of continuing the loop after a non-matching literal → red.
  // The prologue is a SEQUENCE of bare string literals, so `'use strict'` may precede the
  // directive. The regex this scan replaced answered true here; stopping at the first literal
  // would answer false, handing a real Server Action the 200-line utility cap — the direction
  // that fails SILENTLY. No tracked file has the shape today, which is why only a test holds it.
  assert.equal(
    declaresUseServer("'use strict'\n'use server'\nexport async function f() {}\n"),
    true,
  )
  assert.equal(declaresUseServer('"use strict";"use server";\n'), true)
  assert.equal(declaresUseServer("'use strict'\n/* between */\n'use server'\n"), true)
  // A literal that is an EXPRESSION, not a directive, ends the prologue — `.length` is the tell.
  assert.equal(declaresUseServer("'x'.length\n'use server'\n"), false)
  assert.equal(declaresUseServer("'use strict' + 'use server'\n"), false)
  // An unterminated literal is not a prologue entry either.
  assert.equal(declaresUseServer("'unterminated\n'use server'\n"), false)
})

test('an escaped quote inside a prologue literal does not end it early', () => {
  // MUTATION: drop the `c === '\\'` escape branch in readStringLiteral → red. Without it, the
  // backslash before the embedded apostrophe is treated as an ordinary character, so the literal
  // is (wrongly) read as ending at that apostrophe. The truncated remainder ("s'") is neither
  // whitespace, `;`, EOF, newline nor a comment, so endOfPrologueEntry answers -1 and the real
  // `'use server'` that follows is never reached.
  assert.equal(declaresUseServer("'it\\'s'\n'use server'\n"), true)
})

test('a comment directly abutting a prologue literal (no separating newline) still continues it', () => {
  // MUTATION: delete the comment check in endOfPrologueEntry (`content[k] === '/' && ...`) → red.
  // Every other prologue test separates entries with a newline, which already ends the statement
  // via ASI before a comment is ever considered — so this is the only case exercising that branch.
  assert.equal(declaresUseServer("'use strict'/* c */'use server'\n"), true)
  assert.equal(declaresUseServer("'use strict'// trailing\n'use server'\n"), true)
})

test('a directive-shaped literal that is an EXPRESSION is not a declaration', () => {
  // MUTATION: return true on `lit.value === 'use server'` BEFORE calling endOfPrologueEntry → red.
  // That was the shipped shape for one commit: every other literal was checked for whether its
  // statement actually ended, and the one the answer turns on was exempt. `'use server'.length`
  // is a member expression, and V8 does not treat the equivalent `'use strict'.length` as a
  // directive either — verified against the engine, not inferred from the spec.
  assert.equal(declaresUseServer("'use server'.length\n"), false)
  assert.equal(declaresUseServer("'use server' + ''\n"), false)
  // The directive proper still holds, with and without a terminator or a trailing newline.
  assert.equal(declaresUseServer("'use server'\n"), true)
  assert.equal(declaresUseServer("'use server';\n"), true)
  assert.equal(declaresUseServer("'use server'"), true)
})

test('a line comment that runs off the end of the file with no trailing newline is not a declaration', () => {
  // MUTATION: change the line-comment branch's `if (nl === -1) return false` to `return true` →
  // red. Every other `//` fixture in this file ends with `\n`, so `content.indexOf('\n', i)`
  // always succeeds and this fallback is reachable but never observed — the same shape as the
  // EOF-unterminated-literal gap below, one level up (comments, not literals). Confirmed by
  // mutation: flipping that return value leaves the rest of the suite green.
  assert.equal(declaresUseServer('// no trailing newline'), false)
})

test('a literal that runs off the end of the file with no closing quote is unterminated', () => {
  // MUTATION: change readStringLiteral's final fallback `return null` (reached when the scan
  // loop exits because `j` hit `content.length`, as opposed to the explicit `c === '\n'` case
  // above it) to instead treat EOF as a closing quote → red. Every existing unterminated-literal
  // test ends on an internal `\n` (hitting the `c === '\n'` branch directly, e.g. `'unterminated\n`
  // in the second-prologue-entry test above); none exercises a buffer that ends WITHOUT a
  // trailing newline at all, so that fallback `return null` was reachable but never observed. The
  // fixture must be the DIRECTIVE text itself cut short — `'unterminated` fails to distinguish the
  // two returns, since a non-matching value answers `false` either way.
  assert.equal(declaresUseServer("'use server"), false)
  assert.equal(declaresUseServer('"use server'), false)
})
