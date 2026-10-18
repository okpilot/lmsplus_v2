import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ADMIN_DIR = __dirname
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const GUARD_FILES = new Set(['page.tsx', 'route.ts'])

type Kind = 'page' | 'route'

function guardFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const own = entries
    .filter((e) => e.isFile() && GUARD_FILES.has(e.name))
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
  })

  it.each(files)('%s awaits requireAdmin() as the first statement of its entry point', (file) => {
    const source = readFileSync(join(ADMIN_DIR, file), 'utf8')
    const kind: Kind = file.endsWith('route.ts') ? 'route' : 'page'

    expect(guardsFirst(source, kind)).toBe(true)
  })
})
