// Plain server module — deliberately NOT a Server Action ('use server'). It must
// only be reachable from server-side code (submit-section-response.ts), never
// directly from the client. Fires the score-oral-section Edge Function and does
// not await its result — scoring runs off the request path.

/**
 * Triggers async Scribe→Claude scoring for a just-recorded oral exam section
 * response by invoking the score-oral-section Edge Function. Fire-and-forget:
 * failures are logged, never thrown, so a scoring-invoke failure cannot break
 * the caller's submit flow.
 */
export function triggerSectionScoring(
  responseId: string,
  audioPath: string,
  sectionNo: number,
): void {
  const base =
    process.env.SUPABASE_FUNCTIONS_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
  const secret = process.env.ELP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[triggerSectionScoring] ELP_WEBHOOK_SECRET not set')
    return
  }

  void fetch(`${base}/score-oral-section`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({
      record: { id: responseId, audio_path: audioPath, section_no: sectionNo },
    }),
  }).catch((e) => console.error('[triggerSectionScoring] invoke failed:', e))
}
