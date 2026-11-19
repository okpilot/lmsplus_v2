import type { InternalExamCodeRow, ListCodesFilters } from '../types'
import { CodesTable } from './codes-table'

type Props = {
  status?: ListCodesFilters['status']
  codes: InternalExamCodeRow[]
  totalCount: number
  pageSize: number
}

export function CodesTab({ status, codes, totalCount, pageSize }: Readonly<Props>) {
  return <CodesTable rows={codes} status={status} totalCount={totalCount} pageSize={pageSize} />
}
