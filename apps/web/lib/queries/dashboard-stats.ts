/**
 * Pure stat helpers for the dashboard data layer.
 * Extracted from dashboard.ts to keep that file under 200 lines.
 */

import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function getQuestionsToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const todayStart = new Date(Date.now()).toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
    .gte('created_at', todayStart)
  if (error) throw new Error(`Failed to fetch questions answered today: ${error.message}`)
  return count ?? 0
}

// bigint columns may serialize as strings depending on the PostgREST driver; coerce with Number().
type StreakRow = { current_streak: number | string; best_streak: number | string }

export async function getStreakData(
  supabase: SupabaseClient,
): Promise<{ currentStreak: number; bestStreak: number }> {
  // Streak is computed in Postgres (get_student_streak, gaps-and-islands over DISTINCT UTC
  // response dates). The prior client-side computeStreaks ran over a .limit(10000) read that
  // PostgREST truncated at the 1000-row cap, undercounting streaks for high-volume students (#668).
  const { data, error } = await rpc<StreakRow[]>(supabase, 'get_student_streak', {})
  if (error) throw new Error(`Failed to fetch streak: ${error.message}`)
  // rpc() casts the payload without validating shape — guard the array per code-style §5.
  const rows = Array.isArray(data) ? data : []
  const row = rows[0] ?? { current_streak: 0, best_streak: 0 }
  return {
    currentStreak: Number(row.current_streak),
    bestStreak: Number(row.best_streak),
  }
}

type LastPracticedRow = { subject_id: string; last_practiced_at: string }

export async function applyLastPracticed<T extends { id: string; lastPracticedAt: string | null }>(
  supabase: SupabaseClient,
  subjects: T[],
): Promise<T[]> {
  if (!subjects.length) return subjects

  // Last-practiced is computed in Postgres (get_student_last_practiced, MAX(created_at) per
  // subject over ALL responses). The prior client-side map ran over a .limit(5000) read that
  // PostgREST truncated at the 1000-row cap, falsely NULLing subjects answered "late" (#668).
  const { data, error } = await rpc<LastPracticedRow[]>(supabase, 'get_student_last_practiced', {})
  if (error) throw new Error(`Failed to fetch last-practiced: ${error.message}`)

  // rpc() casts the payload without validating shape — guard the array per code-style §5.
  const latestPerSubject = new Map<string, string>()
  for (const row of Array.isArray(data) ? data : []) {
    if (row.subject_id && row.last_practiced_at) {
      latestPerSubject.set(row.subject_id, row.last_practiced_at)
    }
  }

  return subjects.map((s) => ({
    ...s,
    lastPracticedAt: latestPerSubject.get(s.id) ?? null,
  }))
}

export function computeExamReadiness(subjects: { masteryPercentage: number }[]): {
  readyCount: number
  totalCount: number
  projectedDate: string | null
} {
  const readyCount = subjects.filter((s) => s.masteryPercentage >= 90).length
  const totalCount = subjects.length
  return { readyCount, totalCount, projectedDate: null }
}
