import { createHash } from 'node:crypto'
import { Resend } from 'resend'

type SendEmailArgs = {
  to: string
  subject: string
  html: string
  text: string
}

type SendEmailResult = { ok: boolean; error?: string }

/**
 * Sends a transactional email via Resend.
 *
 * Local-dev/test fallback: with no RESEND_API_KEY set in a non-production
 * environment, logs the intent and returns ok so the surrounding flow is
 * testable before domain verification. In production a missing key fails loudly
 * (returns ok:false, no PII logged) so the caller surfaces an error instead of a
 * false success. EMAIL_FROM is mandatory whenever a real send is attempted.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[sendEmail] RESEND_API_KEY is not set — cannot send email')
      return { ok: false, error: 'send_failed' }
    }
    // Redact the recipient — don't leak student PII into shared dev/test logs.
    // String ops (not regex) to avoid a needless ReDoS hotspot on the `to` input.
    const at = to.indexOf('@')
    const redactedTo = at > 0 ? `${to.slice(0, 1)}***${to.slice(at)}` : '***'
    console.log('[email] (dev, no RESEND_API_KEY) would send:', { to: redactedTo, subject })
    return { ok: true }
  }

  const from = process.env.EMAIL_FROM
  if (!from) {
    console.warn('[sendEmail] EMAIL_FROM not configured')
    return { ok: false, error: 'EMAIL_FROM not configured' }
  }

  try {
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({ from, to, subject, html, text })
    if (result.error) {
      // Log the raw third-party detail server-side, but never let it flow through
      // the exported SendEmailResult.error type — return a generic string.
      console.error('[sendEmail] Resend error:', result.error.message)
      return { ok: false, error: 'send_failed' }
    }
    return { ok: true }
  } catch (e) {
    // The SDK can throw (network failure, unexpected validation) rather than
    // returning { error } — keep sendEmail self-defending so callers never see a throw.
    console.error('[sendEmail] Unexpected error:', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'send_failed' }
  }
}

/**
 * Whether `sendEmail` will pass its config checks — mirrors them. Outside
 * production with no RESEND_API_KEY this is true and `sendEmail` only logs
 * (the local-dev fallback above). Callers that change state before sending
 * (e.g. replacing a password) check this first.
 */
export function isEmailConfigured(): boolean {
  if (!process.env.RESEND_API_KEY) return process.env.NODE_ENV !== 'production'
  return Boolean(process.env.EMAIL_FROM)
}

type EmailMessage = SendEmailArgs
type BatchFailure = { index: number; error: string }
type BatchResult = { sent: number[]; failed: BatchFailure[] }

const BATCH_SIZE = 100
const MAX_RETRIES = 2
const MAX_WAIT_MS = 10_000
const DEFAULT_WAIT_MS = 1_000

/** `retry-after` seconds from a Resend response (header name case-insensitive), clamped. */
function retryWaitMs(headers: Record<string, string> | null): number {
  const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === 'retry-after')
  const seconds = key ? Number(headers?.[key]) : Number.NaN
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_WAIT_MS
  return Math.min(ms, MAX_WAIT_MS)
}

const all = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)
const failAll = (from: number, n: number): BatchResult => ({
  sent: [],
  failed: all(from, n).map((index) => ({ index, error: 'send_failed' })),
})

type Chunk = {
  from: string
  messages: readonly EmailMessage[]
  offset: number
  idempotencyKey: string | undefined
}

type ChunkOptions = { batchValidation: 'permissive'; idempotencyKey?: string }

/** One chunk; retries only a 429 (the SDK does not retry, rate limit 10 req/s per team). */
async function sendChunk(
  resend: Resend,
  { from, messages, offset, idempotencyKey }: Readonly<Chunk>,
): Promise<BatchResult> {
  const payload = messages.map((m) => ({ from, ...m }))
  const options: ChunkOptions = { batchValidation: 'permissive' as const }
  if (idempotencyKey) options.idempotencyKey = idempotencyKey
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await resend.batch.send(payload, options)
      if (!res.error) {
        const bad = new Map((res.data.errors ?? []).map((e) => [e.index, e.message]))
        const rows = all(0, messages.length)
        return {
          sent: rows.filter((i) => !bad.has(i)).map((i) => offset + i),
          failed: [...bad.keys()].map((i) => ({ index: offset + i, error: 'send_failed' })),
        }
      }
      console.error('[sendEmailBatch] Resend error:', res.error.message)
      if (res.error.name !== 'rate_limit_exceeded' || attempt >= MAX_RETRIES) break
      await new Promise((r) => setTimeout(r, retryWaitMs(res.headers)))
    } catch (e) {
      console.error(
        '[sendEmailBatch] Unexpected error:',
        e instanceof Error ? e.message : String(e),
      )
      break
    }
  }
  return failAll(offset, messages.length)
}

/**
 * Sends up to any number of emails via Resend batch (100 per request, permissive validation).
 * Same no-key / no-EMAIL_FROM behaviour as `sendEmail`. `ids` (aligned with `messages`) keys each
 * chunk's idempotency by the sha256 of its sorted ids — never code values or addresses.
 * Indexes in the result are positions in `messages`.
 */
export async function sendEmailBatch(
  messages: readonly EmailMessage[],
  opts?: Readonly<{ ids?: readonly string[] }>,
): Promise<BatchResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[sendEmailBatch] RESEND_API_KEY is not set — cannot send email')
      return failAll(0, messages.length)
    }
    console.log('[email] (dev, no RESEND_API_KEY) would send batch:', { count: messages.length })
    return { sent: all(0, messages.length), failed: [] }
  }
  const from = process.env.EMAIL_FROM
  if (!from) {
    console.warn('[sendEmailBatch] EMAIL_FROM not configured')
    return failAll(0, messages.length)
  }
  const resend = new Resend(apiKey)
  const result: BatchResult = { sent: [], failed: [] }
  for (let offset = 0; offset < messages.length; offset += BATCH_SIZE) {
    const chunkIds = opts?.ids?.slice(offset, offset + BATCH_SIZE)
    const key = chunkIds?.length
      ? createHash('sha256')
          .update([...chunkIds].sort().join(','))
          .digest('hex')
      : undefined
    const r = await sendChunk(resend, {
      from,
      messages: messages.slice(offset, offset + BATCH_SIZE),
      offset,
      idempotencyKey: key,
    })
    result.sent.push(...r.sent)
    result.failed.push(...r.failed)
  }
  return result
}
