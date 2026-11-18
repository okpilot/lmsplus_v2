'use client'

import { FieldError } from '@/components/ui/field-error'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { plural } from '../_utils/plural'
import { ISSUE_SKIP_LABEL, issuePopupBanner, issuePreviewLine } from '../_utils/popup-copy'
import { issueSittingCodes } from '../actions/issue-sitting-codes'
import type { IssuePreview } from '../types'
import { CloseButton } from './close-button'
import { PopupBody, PopupFooter } from './popup-parts'
import { useSittingAction } from './use-sitting-action'

type Props = {
  sittingId: string
  /** Undefined = the whole sitting. */
  userIds: readonly string[] | undefined
  preview: IssuePreview
}

const PLAIN_REASONS = new Set(['issue', 'reissue_after_expiry', 'already_issued'])

function Skipped({ preview }: Readonly<{ preview: IssuePreview }>) {
  const skipped = Object.entries(preview.counts).filter(([k]) => !PLAIN_REASONS.has(k))
  if (skipped.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-label text-muted-foreground">Skipped</p>
      <ul className="text-caption">
        {skipped.map(([k, n]) => (
          <li key={k}>
            {plural(n, 'exam')}: {ISSUE_SKIP_LABEL[k] ?? k}
          </li>
        ))}
      </ul>
      {preview.details.length > 0 && (
        <details className="text-caption">
          <summary className="cursor-pointer">
            Show skipped exams ({preview.details.length})
          </summary>
          <ul className="mt-1 list-disc pl-prose-indent">
            {preview.details.map((d) => (
              <li key={d.entryId}>
                {d.student} · {d.subjectShort} — {ISSUE_SKIP_LABEL[d.reason] ?? d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Body and footer of the Issue popup: the preview, then Issue (only when something would be issued). */
export function IssueCodesPanel({ sittingId, userIds, preview }: Readonly<Props>) {
  const { isRefreshing, close } = useSittingUi()
  const { pending, error, run } = useSittingAction()
  const willIssue = (preview.counts.issue ?? 0) + (preview.counts.reissue_after_expiry ?? 0)
  const already = preview.counts.already_issued ?? 0
  const submit = () =>
    run(
      () => issueSittingCodes({ sittingId, ...(userIds ? { userIds } : {}) }),
      (d) => {
        close()
        return issuePopupBanner(d, willIssue)
      },
      { lock: true },
    )
  return (
    <>
      <PopupBody>
        <p className="font-medium">
          {willIssue > 0
            ? issuePreviewLine(willIssue, preview.studentsToIssue)
            : 'Nothing to issue.'}
        </p>
        {already > 0 && (
          <p className="text-caption text-muted-foreground">
            {plural(already, 'exam')} already {already === 1 ? 'has' : 'have'} a code.
          </p>
        )}
        <Skipped preview={preview} />
        <FieldError role="alert">{error}</FieldError>
      </PopupBody>
      <PopupFooter>
        {willIssue > 0 ? (
          <>
            <CloseButton label="Cancel" />
            <LoadingButton loading={pending} disabled={isRefreshing} onClick={submit}>
              Issue {plural(willIssue, 'code')}
            </LoadingButton>
          </>
        ) : (
          <CloseButton />
        )}
      </PopupFooter>
    </>
  )
}
