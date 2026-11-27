const RECORD_CHUNK = 50

/** Stamps `emailed_at` for each sent code (user client, audit row each); returns how many failed. */
export async function recordEmailedCodes(
  rpc: (
    fn: 'record_internal_exam_code_emailed',
    args: { p_code_id: string },
  ) => PromiseLike<{
    error: { message: string } | null
  }>,
  codeIds: readonly string[],
): Promise<number> {
  let failed = 0
  for (let i = 0; i < codeIds.length; i += RECORD_CHUNK) {
    const chunk = codeIds.slice(i, i + RECORD_CHUNK)
    const results = await Promise.allSettled(
      chunk.map((id) => rpc('record_internal_exam_code_emailed', { p_code_id: id })),
    )
    results.forEach((r, n) => {
      const message =
        r.status === 'rejected'
          ? r.reason instanceof Error
            ? r.reason.message
            : String(r.reason)
          : r.value.error?.message
      if (message === undefined) return
      console.error('[emailSittingCodes] record failed', chunk[n], message)
      failed++
    })
  }
  return failed
}
