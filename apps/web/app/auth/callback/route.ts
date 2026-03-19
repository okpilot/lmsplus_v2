import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = new URL('/', request.url)

  if (!code) {
    redirectTo.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(redirectTo)
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    redirectTo.searchParams.set('error', 'invalid_code')
    return NextResponse.redirect(redirectTo)
  }

  // Verify this user has a record in our users table (pre-created by admin)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    await supabase.auth.signOut()
    redirectTo.searchParams.set('error', 'auth_failed')
    return NextResponse.redirect(redirectTo)
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[auth/callback] Profile lookup failed:', profileError.message)
    await supabase.auth.signOut()
    redirectTo.searchParams.set('error', 'profile_lookup_failed')
    return NextResponse.redirect(redirectTo)
  }

  if (!profile) {
    await supabase.auth.signOut()
    redirectTo.searchParams.set('error', 'not_registered')
    return NextResponse.redirect(redirectTo)
  }

  // Support recovery flow: if `next` points to an allowed path, redirect there
  const ALLOWED_NEXT_PATHS = ['/auth/reset-password']
  const rawNext = searchParams.get('next') ?? ''
  const extractedNext = rawNext.startsWith('http') ? new URL(rawNext).pathname : rawNext
  const isRecoveryRedirect = ALLOWED_NEXT_PATHS.includes(extractedNext)

  if (isRecoveryRedirect) {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    cookieStore.set('__recovery_pending', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
    redirectTo.pathname = extractedNext
  } else {
    redirectTo.pathname = '/app/dashboard'
  }

  return NextResponse.redirect(redirectTo)
}
