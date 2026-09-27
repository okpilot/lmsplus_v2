/** Escapes PostgREST `like`/`ilike` metacharacters so a caller-supplied value is matched literally. */
export function escapeLike(value: string): string {
  return value.replaceAll(/[%_\\]/g, String.raw`\$&`)
}
