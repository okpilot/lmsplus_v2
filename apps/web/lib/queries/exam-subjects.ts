import { createServerSupabaseClient } from '@repo/db/server'

export type ExamSubjectOption = {
  id: string
  code: string
  name: string
  short: string
  totalQuestions: number
  timeLimitSeconds: number
  passMark: number
}

export async function getExamEnabledSubjects(): Promise<ExamSubjectOption[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('exam_configs')
    .select(
      'subject_id, total_questions, time_limit_seconds, pass_mark, easa_subjects(id, code, name, short)',
    )
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('subject_id')

  if (error) {
    console.error('[getExamEnabledSubjects] Query error:', error.message)
    return []
  }

  if (!data) return []

  return data
    .filter((row) => row.easa_subjects !== null)
    .map((row) => {
      const subject = row.easa_subjects as unknown as {
        id: string
        code: string
        name: string
        short: string
      }
      return {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        short: subject.short,
        totalQuestions: row.total_questions,
        timeLimitSeconds: row.time_limit_seconds,
        passMark: row.pass_mark,
      }
    })
}
