import { sendInternalExamCodeEmail } from '../../actions/send-code-email'
import { issueSkipText, type ResultBannerData } from '../_utils/copy'
import { type IssueCounts, issueSittingCodes } from '../actions/issue-sitting-codes'
import { removeSittingEntries } from '../actions/remove-entries'
import { voidSittingCode } from '../actions/void-sitting-code'
import type { RosterEntry } from '../types'
import { useSittingAction } from './use-sitting-action'

type Args = {
  sittingId: string
  entry: RosterEntry
  personName: string
  who: string
  /** Called when an action succeeded, before its banner shows. */
  onDone: () => void
}

function issueBanner(d: IssueCounts): ResultBannerData {
  if (d.reissuedAfterExpiry > 0) return { tone: 'success', title: 'Code re-issued.' }
  if (d.issued > 0) return { tone: 'success', title: 'Code issued.' }
  const why = issueSkipText(d)
  return { tone: 'caution', title: 'No code issued.', ...(why ? { detail: why } : {}) }
}

/** Issue / void / remove for one exam of the roster; each result is a toast or banner. */
export function useExamActions({ sittingId, entry, personName, who, onDone }: Readonly<Args>) {
  const { pending, error, run, clearError } = useSittingAction()
  const issue = () =>
    run(() => issueSittingCodes({ sittingId, entryIds: [entry.entryId] }), issueBanner, {
      errorAsBanner: true,
    })
  const sendCode = (codeId: string) =>
    run(
      async () => {
        const r = await sendInternalExamCodeEmail({ codeId })
        return r.success ? { success: true as const } : { success: false as const, error: r.error }
      },
      () => ({ tone: 'success', title: `Code emailed to ${personName}.` }),
      { errorAsBanner: true },
    )
  const voidCode = (codeId: string, reason: string) =>
    run(
      () => voidSittingCode({ sittingId, codeId, reason }),
      () => {
        onDone()
        return { tone: 'success', title: `Voided the code for ${who}.` }
      },
    )
  const remove = () =>
    run(
      () => removeSittingEntries({ sittingId, entryIds: [entry.entryId] }),
      (d) => {
        onDone()
        return {
          tone: 'success',
          title: `Removed ${entry.subjectShort} for ${personName}.`,
          ...(d.codesVoided > 0 ? { detail: 'Its unused code was voided.' } : {}),
        }
      },
    )
  return { pending, error, clearError, issue, sendCode, voidCode, remove }
}
