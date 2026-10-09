export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { version: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
