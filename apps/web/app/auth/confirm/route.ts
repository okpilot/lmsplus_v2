import { createServerSupabaseClient } from '@repo/db/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = next
  redirectTo.search = ''

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      return NextResponse.redirect(redirectTo)
    }

    console.error('[auth/confirm] OTP verification failed:', error.message)
  }

  // Return user to login with error
  redirectTo.pathname = '/'
  redirectTo.searchParams.set('error', 'invalid_recovery_link')
  return NextResponse.redirect(redirectTo)
}
