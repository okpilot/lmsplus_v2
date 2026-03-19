import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { rpc } from '@/lib/supabase-rpc'

export async function GET(request: NextRequest) {
  const redirectTo = new URL('/app/dashboard', request.url)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Best-effort audit — don't block login if it fails
  const { error } = await rpc(supabase, 'record_login', {})
  if (error) {
    console.error('[login-complete] record_login RPC failed:', error.message)
  }

  return NextResponse.redirect(redirectTo)
}
