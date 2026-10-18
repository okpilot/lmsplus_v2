// Covers: the first statement `await requireAdmin()` in the default export of page/layout/template/default,
// and in each exported HTTP-method function of route; route variable/specifier exports of a method are rejected.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ADMIN_DIR = __dirname
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const GUARD_FILE = /^(page|layout|template|default|route)\.[jt]sx?$/

type Kind = 'page' | 'route'

function guardFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const own = entries
    .filter((e) => e.isFile() && GUARD_FILE.test(e.name))
    .map((e) => join(dir, e.name))
  return own.concat(
    entries.filter((e) => e.isDirectory()).flatMap((e) => guardFiles(join(dir, e.name))),
  )
}

function hasModifier(node: ts.FunctionDeclaration, kind: ts.SyntaxKind): boolean {
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
}

function isAwaitRequireAdmin(statement: ts.Statement | undefined): boolean {
  if (!statement || !ts.isExpressionStatement(statement)) return false
  const expr = statement.expression
  if (!ts.isAwaitExpression(expr) || !ts.isCallExpression(expr.expression)) return false
  const callee = expr.expression.expression
  return ts.isIdentifier(callee) && callee.text === 'requireAdmin'
}

function importsRequireAdmin(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === '@/lib/auth/require-admin' &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some((el) => el.name.text === 'requireAdmin'),
  )
}

function hasMethodVariableExport(sf: ts.SourceFile): boolean {
  return sf.statements.some((s) => {
    if (ts.isVariableStatement(s) && hasExport(s)) {
      return s.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && HTTP_METHODS.has(d.name.text),
      )
    }
    if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
      return s.exportClause.elements.some((el) => HTTP_METHODS.has(el.name.text))
    }
    return false
  })
}

function hasExport(node: ts.VariableStatement): boolean {
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function entryPoints(sf: ts.SourceFile, kind: Kind): ts.FunctionDeclaration[] {
  const fns = sf.statements.filter(ts.isFunctionDeclaration)
  if (kind === 'page') {
    return fns.filter(
      (f) =>
        hasModifier(f, ts.SyntaxKind.ExportKeyword) && hasModifier(f, ts.SyntaxKind.DefaultKeyword),
    )
  }
  return fns.filter(
    (f) =>
      hasModifier(f, ts.SyntaxKind.ExportKeyword) &&
      f.name !== undefined &&
      HTTP_METHODS.has(f.name.text),
  )
}

/** True when every entry point awaits requireAdmin() as its first statement and the import exists. */
function guardsFirst(source: string, kind: Kind): boolean {
  const sf = ts.createSourceFile('f.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const entries = entryPoints(sf, kind)
  if (entries.length === 0) return false
  if (kind === 'route' && hasMethodVariableExport(sf)) return false
  return importsRequireAdmin(sf) && entries.every((f) => isAwaitRequireAdmin(f.body?.statements[0]))
}

const IMPORT = "import { requireAdmin } from '@/lib/auth/require-admin'\n"

describe('guard checker controls', () => {
  // CONTROL: green
  it('accepts a page whose default export awaits requireAdmin() first', () => {
    const src = `${IMPORT}export default async function P() {\n  await requireAdmin()\n  return null\n}`
    expect(guardsFirst(src, 'page')).toBe(true)
  })

  // CONTROL: green
  it('accepts a route whose every exported handler awaits requireAdmin() first', () => {
    const src = `${IMPORT}export async function GET() {\n  await requireAdmin()\n  return null\n}`
    expect(guardsFirst(src, 'route')).toBe(true)
  })

  // CONTROL: red
  it('rejects a page that calls requireAdmin() after another statement', () => {
    const src = `${IMPORT}export default async function P() {\n  const x = 1\n  await requireAdmin()\n  return x\n}`
    expect(guardsFirst(src, 'page')).toBe(false)
  })

  // CONTROL: red
  it('rejects a page whose guard lives only in a helper, not the default export', () => {
    const src = `${IMPORT}async function helper() {\n  await requireAdmin()\n}\nexport default async function P() {\n  return null\n}`
    expect(guardsFirst(src, 'page')).toBe(false)
  })

  // CONTROL: red
  it('rejects a page that does not import requireAdmin', () => {
    const src = `export default async function P() {\n  await requireAdmin()\n  return null\n}`
    expect(guardsFirst(src, 'page')).toBe(false)
  })

  // CONTROL: green
  it('accepts a layout whose default export awaits requireAdmin() first', () => {
    const src = `${IMPORT}export default async function L({ children }) {\n  await requireAdmin()\n  return children\n}`
    expect(guardsFirst(src, 'page')).toBe(true)
  })

  // CONTROL: red
  it('rejects a layout whose default export returns children without the guard', () => {
    const src = `${IMPORT}export default async function L({ children }) {\n  return children\n}`
    expect(guardsFirst(src, 'page')).toBe(false)
  })

  // CONTROL: red
  it('rejects a route that exports a handler as a const next to a guarded function', () => {
    const src = `${IMPORT}export async function GET() {\n  await requireAdmin()\n}\nexport const POST = async () => null`
    expect(guardsFirst(src, 'route')).toBe(false)
  })

  // CONTROL: red
  it('rejects a route that re-exports a handler under an HTTP method name', () => {
    const src = `${IMPORT}async function handler() {\n  return null\n}\nexport async function GET() {\n  await requireAdmin()\n}\nexport { handler as POST }`
    expect(guardsFirst(src, 'route')).toBe(false)
  })

  // CONTROL: green
  it('accepts a route that also exports a non-method const', () => {
    const src = `${IMPORT}export const dynamic = 'force-dynamic'\nexport async function GET() {\n  await requireAdmin()\n}`
    expect(guardsFirst(src, 'route')).toBe(true)
  })

  // CONTROL: red
  it('rejects a route with one unguarded exported handler', () => {
    const src = `${IMPORT}export async function GET() {\n  await requireAdmin()\n}\nexport async function POST() {\n  return null\n}`
    expect(guardsFirst(src, 'route')).toBe(false)
  })
})

const files = guardFiles(ADMIN_DIR).map((f) => relative(ADMIN_DIR, f))

describe('admin pages and route handlers', () => {
  it('discovers the admin pages including the root page', () => {
    expect(files.filter((f) => f.endsWith('page.tsx')).length).toBeGreaterThan(0)
    expect(files).toContain('page.tsx')
    expect(files).toContain('layout.tsx')
  })

  it.each(files)('%s awaits requireAdmin() as the first statement of its entry point', (file) => {
    const source = readFileSync(join(ADMIN_DIR, file), 'utf8')
    const kind: Kind = /^route\./.test(basename(file)) ? 'route' : 'page'

    expect(guardsFirst(source, kind)).toBe(true)
  })
})
