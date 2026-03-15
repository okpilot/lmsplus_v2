import { createServerSupabaseClient } from '@repo/db/server'

type AdminAuth = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
}

export async function requireAdmin(): Promise<AdminAuth> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Not authenticated')
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()

  if (profileError) {
    console.error('[requireAdmin] Profile query error:', profileError.message)
  }

  if (profile?.role !== 'admin') {
    throw new Error('Forbidden: admin role required')
  }

  return { supabase, userId: user.id }
}
