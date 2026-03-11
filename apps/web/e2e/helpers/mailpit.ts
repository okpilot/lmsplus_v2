/**
 * Email helper for Supabase local development.
 * Supabase local uses Inbucket for email capture.
 * The Inbucket REST API is at http://localhost:54324/api/v1/
 *
 * Inbucket API docs: https://github.com/inbucket/inbucket/wiki/REST-API
 */

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'

type InbucketMessage = {
  mailbox: string
  id: string
  from: string
  to: string[]
  subject: string
  date: string
  size: number
}

type InbucketMessageDetail = {
  mailbox: string
  id: string
  from: string
  subject: string
  date: string
  body: {
    text: string
    html: string
  }
}

/** Derive the Inbucket mailbox name from an email address (local part). */
function mailboxName(email: string): string {
  return email.split('@')[0] ?? email
}

/** List messages in a mailbox. */
async function listMessages(email: string): Promise<InbucketMessage[]> {
  const mailbox = mailboxName(email)
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`listMessages: ${res.status}`)
  return res.json() as Promise<InbucketMessage[]>
}

/** Get a specific message by mailbox and ID. */
async function getMessage(email: string, id: string): Promise<InbucketMessageDetail> {
  const mailbox = mailboxName(email)
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${id}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`getMessage: ${res.status}`)
  return res.json() as Promise<InbucketMessageDetail>
}

/** Get the latest email for a given address. Retries up to 10 seconds. */
export async function getLatestEmail(
  email: string,
): Promise<{ HTML: string; Text: string; Subject: string }> {
  const maxWait = 10_000
  const interval = 500
  const deadline = Date.now() + maxWait

  while (Date.now() < deadline) {
    const messages = await listMessages(email)
    if (messages.length > 0) {
      // Sort by date descending to get latest
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const latest = messages[0]
      if (!latest) throw new Error('Unexpected: empty messages after length check')
      const detail = await getMessage(email, latest.id)
      // Return in the shape the auth setup expects
      return { HTML: detail.body.html, Text: detail.body.text, Subject: detail.subject }
    }
    await new Promise((r) => setTimeout(r, interval))
  }

  throw new Error(`No email received for ${email} within ${maxWait}ms`)
}

/** Extract the magic link URL from an email HTML body. */
export function extractMagicLink(html: string): string {
  // Look for the Supabase verify link
  const match = html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)
  if (match?.[1]) {
    // HTML-decode the URL (e.g. &amp; → &)
    return match[1].replace(/&amp;/g, '&')
  }

  // Fallback: any link in the email
  const fallback = html.match(/href="(http[^"]+)"/)
  if (fallback?.[1]) return fallback[1].replace(/&amp;/g, '&')

  throw new Error('Could not extract magic link from email body')
}

/** Delete all messages in the mailbox for the given email. */
export async function clearAllMessages(email?: string) {
  if (!email) return
  const mailbox = mailboxName(email)
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`clearAllMessages: ${res.status}`)
}
