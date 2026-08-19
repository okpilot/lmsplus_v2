# AST / TypeScript-parser oracle facts

Measured on **TypeScript 6.0.3** (root devDependency, resolvable from the repo root — `.claude/hooks/*.mjs` can `import ts from 'typescript'`), against the repo's full 1140-file tracked JS/TS corpus. Referenced from `MEMORY.md` § Durable knowledge. Origin: review of the `check-no-executable-change.mjs` parser rebuild, branch `chore/backlog-flow-control` on `5d32bac2`.

## A pre-order walk with no close-delimiter is NOT injective

`acc.push(n.kind); ts.forEachChild(n, walk)` flattens two different trees to the same string whenever a node's arity can absorb a sibling. Brute force over 33,684 generated sources produced **4,689 collisions**. Minimal and realistic reproducers, all fingerprinting IDENTICALLY:

| A | B | shape |
|---|---|---|
| `const v = [[a], b]` | `const v = [[a, b]]` | array element moved inward |
| `log(fmt(x), y)` | `log(fmt(x, y))` | call argument moved into a nested call |
| `cn(clsx(a), b)` | `cn(clsx(a, b))` | same, className helper |
| `expect(sum(1), 2).toBe(3)` | `expect(sum(1, 2)).toBe(3)` | same, test call |
| `await Promise.all([race(a), b])` | `await Promise.all([race(a, b)])` | same, array arg |
| `if (a) { f() }` + `g()` | `if (a) { f()\ng() }` | **statement moved into an if-body** |
| `for (const x of xs) { f(x) }` + `g()` | `for (…) { f(x)\ng() }` | statement moved into a loop body |
| `function h(){ f() }` + `g()` | `function h(){ f()\ng() }` | statement moved into a function body |
| `it('x', () => { f(a) }); g(b)` | `it('x', () => { f(a); g(b) })` | statement moved into a callback |
| `{k: X} + b` | `{k: X + b}` | operand moved into an object member |

Fix, verified to resolve every one: emit a close marker after the child walk —
```js
const walk = (n) => { acc.push(n.kind); /* …property captures… */ ts.forEachChild(n, walk); acc.push(')') }
```
`try { f() } catch {}` + `g()` vs `try { f()\ng() } catch {}` does NOT collide — the `catch` clause is a child that shifts position. Absence of a collision in one sample proves nothing about the class.

Corollary: a flat `join('|')` is also separator-injectable. `JsxText` raw text may contain `|`, and only the `t`/`o`/`f`/`T` prefixes keep pushes apart. A close marker plus escaping removes both concerns.

## The `ts.forEachChild` "enum property, not a child node" surface

Enumerated empirically: walk every repo file, and for every visited node record `Object.keys(node)` whose value is a `number` or `boolean` (ignoring `kind/flags/pos/end/transformFlags/modifierFlagsCache/id/emitNode`). Full result:

**Semantic — must be captured or it is a false EXEMPT:**
- `ImportClause.isTypeOnly`, `ImportSpecifier.isTypeOnly`, `ExportDeclaration.isTypeOnly`, `ExportSpecifier.isTypeOnly` — `import type {X}` vs `import {X}`. ~789 `import type`/`export type` statements across 473 files in this repo.
- `ImportClause.phaseModifier` — TS 6 `import defer * as ns from 'm'` vs `import * as ns from 'm'`.
- `HeritageClause.token` — `class C extends D {}` vs `class C implements D {}`. Zero live `class … extends` in this repo's TS/TSX corpus, so latent here, but real.
- `ExportAssignment.isExportEquals` — `export = 1` (CJS export assignment) vs `export default 1`.
- `MetaProperty.keywordToken` — `import.meta` vs `new.target`.
- `Prefix/PostfixUnaryExpression.operator`, `TypeOperator.operator`.

**Cosmetic — safe to ignore:** `Array/Object/Block.multiLine`, `NumericLiteral.numericLiteralFlags`, `StringLiteral.hasExtendedUnicodeEscape`, `Template*.templateFlags`, `JsxText.containsOnlyTriviaWhiteSpaces`, `SwitchStatement.possiblyExhaustive`, `ImportTypeNode.isTypeOf`.

**Not a property at all:** template RAW text. `.text` is the COOKED value, so ``String.raw`x\ny` `` and a literal newline cook identically while producing different strings. Only a raw source slice distinguishes them.

## `NodeFlags` masks go stale silently

`ts.NodeFlags`: `Let = 1`, `Const = 2`, **`Using = 4`, `AwaitUsing = 6`**. A `Let | Const` (= 3) mask therefore reports:
- `using a = r()` ≡ `var a = r()` (4 & 3 = 0, same as `var`)
- `await using a = r()` ≡ `const a = r()` (6 & 3 = 2, same as `const`)

Both are real emit differences (`__addDisposableResource` / `__disposeResources` scaffolding, `Symbol.dispose` at scope exit). `Using`/`AwaitUsing` were added in TS 5.2 — this is the version-coupling failure mode that matters, and it fails OPEN with no test failure.

## `sf.parseDiagnostics` holds SYNTAX errors only

Verified case by case — `0` diagnostics for every one of: `const x: number = "nope"`, `doesNotExist()`, wrong arg count, missing property, **`const x: number` with no initializer**, **`class C { public public x = 1 }`**, **top-level `return 1`**, **top-level `await x`**, and TS type syntax in a `.js` file. Non-zero only for unterminated string literals, unbalanced braces, stray tokens, and JSX parsed under `ScriptKind.TS`.

So a 100% classifiable rate over a real corpus is the expected result, not evidence the check is a no-op. But `parseDiagnostics` is `@internal` in the TS public API: `(sf.parseDiagnostics ?? []).length > 0` silently becomes a no-op — fail-OPEN — if a future TS renames it. `ts.createSourceFile(...).parseDiagnostics` still exists at runtime in 6.0.3.

## Cost

4.0 ms per parse on the 100 largest repo `.ts`/`.tsx` files (2.2 MB total, parsed twice each = 805 ms). The whole 1126-file corpus fingerprints once in 438 ms. Parsing every changed file twice is free at any realistic commit size — never a reason to cache or single-pass.

## Version coupling of `ts.SyntaxKind` numerals

A non-issue **when both fingerprints are produced in one process from one `ts` module instance and never persisted** — which is the case in `classifyPair`. Confirm that property before dismissing it; the moment a fingerprint is written to disk or compared across runs, the numerals become a correctness hazard.
