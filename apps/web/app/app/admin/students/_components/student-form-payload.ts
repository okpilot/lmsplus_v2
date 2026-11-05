import { sameIdSet } from '../_utils/same-id-set'
import type { StudentRow } from '../types'

type PayloadInput = {
  student: StudentRow | undefined
  email: string
  fullName: string
  role: string
  courseIds: string[]
}

export function buildStudentPayload({ student, email, fullName, role, courseIds }: PayloadInput) {
  if (student) {
    return {
      id: student.id,
      full_name: fullName,
      role,
      course_ids: sameIdSet(courseIds, student.course_ids) ? undefined : courseIds,
    }
  }
  return { email, full_name: fullName, role, course_ids: courseIds }
}

export function canSubmitStudent(
  payload: ReturnType<typeof buildStudentPayload>,
  isEdit: boolean,
): boolean {
  const hasName = payload.full_name.trim() !== ''
  if (isEdit) return hasName
  return (payload.email?.trim() ?? '') !== '' && hasName
}
