import { matchRpcError } from '@/lib/rpc-error-match'

const WRITE_ERRORS: Readonly<Record<string, string>> = {
  exam_config_in_use:
    'This exam is used by a scheduled or open sitting. Close or cancel that sitting, or remove its candidates for this subject, before disabling the exam.',
}

/** User-facing copy for an exam-config write error; `fallback` for anything unmapped. */
export function examConfigWriteError(message: string | undefined, fallback: string): string {
  return matchRpcError(message, WRITE_ERRORS) ?? fallback
}
