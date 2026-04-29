'use client'

import { useState } from 'react'
import type { ExamSubjectOption, InternalExamCodeRow, OrgStudentOption } from '../types'
import { CodesTable } from './codes-table'
import { IssueCodeForm } from './issue-code-form'
import { IssuedCodePanel } from './issued-code-panel'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  codes: InternalExamCodeRow[]
}

export type IssuedCode = { code: string; expiresAt: string }

export function CodesTab({ students, subjects, codes }: Props) {
  const [issued, setIssued] = useState<IssuedCode | null>(null)

  return (
    <div className="space-y-6">
      <IssueCodeForm students={students} subjects={subjects} onIssued={(code) => setIssued(code)} />
      {issued ? (
        <IssuedCodePanel
          code={issued.code}
          expiresAt={issued.expiresAt}
          onDismiss={() => setIssued(null)}
        />
      ) : null}
      <CodesTable rows={codes} />
    </div>
  )
}
