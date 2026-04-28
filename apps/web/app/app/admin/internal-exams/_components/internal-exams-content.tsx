import {
  listExamSubjects,
  listInternalExamAttempts,
  listInternalExamCodes,
  listOrgStudents,
} from '../queries'
import { InternalExamsTabs } from './internal-exams-tabs'

export async function InternalExamsContent() {
  const [students, subjects, codesResult, attemptsResult] = await Promise.all([
    listOrgStudents(),
    listExamSubjects(),
    listInternalExamCodes(),
    listInternalExamAttempts(),
  ])

  return (
    <InternalExamsTabs
      students={students}
      subjects={subjects}
      codes={codesResult.rows}
      attempts={attemptsResult.rows}
    />
  )
}
