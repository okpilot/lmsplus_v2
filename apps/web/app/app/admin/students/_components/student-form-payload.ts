import { CreateStudentSchema, UpdateStudentSchema } from '@repo/db/schema'
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

export function canSubmitStudent(payload: unknown, isEdit: boolean): boolean {
  return (isEdit ? UpdateStudentSchema.omit({ id: true }) : CreateStudentSchema).safeParse(payload)
    .success
}
