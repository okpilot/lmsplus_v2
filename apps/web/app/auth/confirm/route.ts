import { createServerSupabaseClient } from '@repo/db/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const ALLOWED_NEXT_PATHS = ['/auth/reset-password']
  const rawNext = searchParams.get('next') ?? '/'
  // next may be a full URL (from {{ .RedirectTo }}) or just a path — extract pathname only
  const extracted = rawNext.startsWith('http') ? new URL(rawNext).pathname : rawNext
  const nextPath = ALLOWED_NEXT_PATHS.includes(extracted) ? extracted : '/'

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      // Use next/navigation redirect so cookies set by verifyOtp are preserved
      redirect(nextPath)
    }

    console.error('[auth/confirm] OTP verification failed:', error.message)
  }

  // Return user to login with error
  redirect(`/?error=invalid_recovery_link`)
}
