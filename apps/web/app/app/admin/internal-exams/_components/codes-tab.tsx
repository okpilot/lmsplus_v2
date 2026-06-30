'use client'

import { useState } from 'react'
import type {
  ExamSubjectOption,
  InternalExamCodeRow,
  ListCodesFilters,
  OrgStudentOption,
} from '../types'
import { CodesTable } from './codes-table'
import { IssueCodeForm } from './issue-code-form'
import { IssuedCodePanel } from './issued-code-panel'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  status?: ListCodesFilters['status']
  codes: InternalExamCodeRow[]
  totalCount: number
  pageSize: number
}

export type IssuedCode = { codeId: string; code: string; expiresAt: string }

export function CodesTab({
  students,
  subjects,
  status,
  codes,
  totalCount,
  pageSize,
}: Readonly<Props>) {
  const [issued, setIssued] = useState<IssuedCode | null>(null)

  return (
    <div className="space-y-6">
      <IssueCodeForm
        students={students}
        subjects={subjects}
        onIssued={(issued) => setIssued(issued)}
      />
      {issued ? (
        <IssuedCodePanel
          codeId={issued.codeId}
          code={issued.code}
          expiresAt={issued.expiresAt}
          onDismiss={() => setIssued(null)}
        />
      ) : null}
      <CodesTable rows={codes} status={status} totalCount={totalCount} pageSize={pageSize} />
    </div>
  )
}
