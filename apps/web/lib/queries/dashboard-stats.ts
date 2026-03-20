/**
 * Pure stat helpers for the dashboard data layer.
 * Extracted from dashboard.ts to keep that file under 200 lines.
 */

import type { createServerSupabaseClient } from '@repo/db/server'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type ResponseDateRow = { question_id: string; created_at: string }

export async function getQuestionsToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const todayStart = new Date(Date.now()).toISOString().slice(0, 10)
  const { count } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
    .gte('created_at', todayStart)
  return count ?? 0
}

export async function getStreakData(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ currentStreak: number; bestStreak: number }> {
  const { data } = await supabase
    .from('student_responses')
    .select('created_at')
    .eq('student_id', userId)
    .order('created_at', { ascending: false })
    .limit(10000)

  const rows = (data ?? []) as { created_at: string }[]
  const uniqueDates = [...new Set(rows.map((r) => r.created_at.slice(0, 10)))].sort((a, b) =>
    b.localeCompare(a),
  )
  return computeStreaks(uniqueDates)
}

export function computeStreaks(sortedDatesDesc: string[]): {
  currentStreak: number
  bestStreak: number
} {
  if (!sortedDatesDesc.length) return { currentStreak: 0, bestStreak: 0 }

  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10)
  const anchoredToNow = sortedDatesDesc[0] === today || sortedDatesDesc[0] === yesterday

  let streak = 1
  let bestStreak = 1
  // Capture streak length at first break (= the streak anchored to sortedDatesDesc[0])
  let currentStreak: number | null = null

  for (let i = 0; i < sortedDatesDesc.length - 1; i++) {
    // Loop bound guarantees both indices are valid
    const currStr = sortedDatesDesc[i]!
    const nextStr = sortedDatesDesc[i + 1]!
    const curr = new Date(currStr)
    const next = new Date(nextStr)
    const diffDays = Math.round((curr.getTime() - next.getTime()) / 86400000)
    if (diffDays === 1) {
      streak++
      bestStreak = Math.max(bestStreak, streak)
    } else {
      currentStreak ??= streak
      streak = 1
    }
  }

  bestStreak = Math.max(bestStreak, streak)
  currentStreak ??= streak

  return { currentStreak: anchoredToNow ? currentStreak : 0, bestStreak }
}

export async function applyLastPracticed<T extends { id: string; lastPracticedAt: string | null }>(
  supabase: SupabaseClient,
  userId: string,
  subjects: T[],
  questionSubjectMap: Map<string, string>,
): Promise<T[]> {
  if (!subjects.length) return subjects

  const { data } = await supabase
    .from('student_responses')
    .select('question_id, created_at')
    .eq('student_id', userId)
    .order('created_at', { ascending: false })
    .limit(5000)

  const rows = (data ?? []) as ResponseDateRow[]
  const latestPerSubject = new Map<string, string>()

  for (const r of rows) {
    const subjectId = questionSubjectMap.get(r.question_id)
    if (!subjectId) continue
    if (!latestPerSubject.has(subjectId)) {
      latestPerSubject.set(subjectId, r.created_at)
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
