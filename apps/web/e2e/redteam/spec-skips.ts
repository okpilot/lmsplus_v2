// Detects a red-team spec that is still statically skipped, for attack-surface.test.ts.
import ts from 'typescript'

/** Callees whose call skips a test or a block. */
const SKIP_CALLEES = new Set([
  'test.skip',
  'test.fixme',
  'test.describe.skip',
  'test.describe.fixme',
  'it.skip',
  'describe.skip',
])

/** Binary operators whose right operand runs only on some inputs. */
const CONDITIONAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

/** The dotted name of a callee (`test.describe.skip`), or `null` when it is not a plain name chain. */
function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (!ts.isPropertyAccessExpression(expression)) return null
  const head = calleeName(expression.expression)
  return head === null ? null : `${head}.${expression.name.text}`
}

/** True when `node` is a branch, loop, catch or short-circuit that runs its body only on some inputs. */
function isConditionalNode(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node)) return CONDITIONAL_OPERATORS.has(node.operatorToken.kind)
  return (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseOrDefaultClause(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isCatchClause(node)
  )
}

/** True when a skip call skips unconditionally: titled, or untitled with no argument or `true`, outside any branch. */
function isStaticSkip(call: ts.CallExpression): boolean {
  const first = call.arguments[0]
  if (first !== undefined && (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))) {
    return true
  }
  if (first !== undefined && first.kind !== ts.SyntaxKind.TrueKeyword) return false
  for (let node: ts.Node = call.parent; !ts.isSourceFile(node); node = node.parent) {
    if (isConditionalNode(node)) return false
  }
  return true
}

/** True when the spec source holds a static skip. */
function hasStaticSkip(source: string): boolean {
  const file = ts.createSourceFile(
    'spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const visit = (node: ts.Node): boolean =>
    (ts.isCallExpression(node) &&
      SKIP_CALLEES.has(calleeName(node.expression) ?? '') &&
      isStaticSkip(node)) ||
    (ts.forEachChild(node, visit) ?? false)
  return visit(file)
}

/** IDs of 7-cell rows past `GAP` whose spec file holds a static skip — a skipped spec passes `e2e:redteam` while running nothing. */
export function skippedSpecRowIds(
  rows: string[][],
  readSpec: (name: string) => string,
  specFileExists: (name: string) => boolean = () => true,
): string[] {
  return rows
    .filter((r) => r.length === 7 && r[4]?.trim() !== 'GAP')
    .filter((r) => specFileExists((r[3] ?? '').trim()))
    .filter((r) => hasStaticSkip(readSpec((r[3] ?? '').trim())))
    .map((r) => (r[0] ?? '').trim())
}
