/**
 * Shared RPC-set derivation for red-team specs that probe every public
 * function's EXECUTE privilege via direct PostgREST `/rpc/<fn>` calls
 * (Vector FS).
 *
 * The function set — name plus its body parameter names — is derived at
 * runtime from the PostgREST OpenAPI root, never hardcoded: a function added
 * after this helper was written is covered automatically.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

export type RpcSpec = { name: string; params: string[] }

/**
 * Fetch the current public-schema function set from the PostgREST OpenAPI
 * root's `paths` map. For each `/rpc/<fn>` entry, read the POST operation's
 * `in: 'body'` parameter's `schema.properties` to get the function's
 * argument names — a parameterless function yields an empty `params` array.
 */
export async function deriveRpcSpecs(): Promise<RpcSpec[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY as string,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!res.ok) throw new Error(`OpenAPI root fetch failed: ${res.status} ${res.statusText}`)
  const body: unknown = await res.json()
  const raw =
    typeof body === 'object' && body !== null ? (body as { paths?: unknown }).paths : undefined
  if (typeof raw !== 'object' || raw === null) throw new Error('OpenAPI root has no paths object')
  const paths = raw as Record<
    string,
    {
      post?: {
        parameters?: Array<{ in?: string; schema?: { properties?: Record<string, unknown> } }>
      }
    }
  >

  const rpcPaths = Object.entries(paths).filter(([path]) => path.startsWith('/rpc/'))

  return rpcPaths.map(([path, def]) => {
    const name = path.slice('/rpc/'.length)
    const postParams = def.post?.parameters ?? []
    const bodyParam = postParams.find((p) => p.in === 'body')
    const properties = bodyParam?.schema?.properties ?? {}
    return { name, params: Object.keys(properties) }
  })
}
