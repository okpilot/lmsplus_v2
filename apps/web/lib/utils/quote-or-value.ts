/** Quotes a value for a PostgREST `or()` filter so `,` `(` `)` stay literal. */
export function quoteOrValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}
