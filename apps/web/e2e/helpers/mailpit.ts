/**
 * Email helper for Supabase local development.
 * Supabase local uses Mailpit for email capture.
 * The Mailpit REST API is at http://localhost:54324/api/v1/
 *
 * Mailpit API docs: https://mailpit.axllent.org/docs/api-v1/
 */

const MAILPIT_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'

type MailpitMessage = {
  ID: string
  From: { Name: string; Address: string }
  To: { Name: string; Address: string }[]
  Subject: string
  Created: string
  Size: number
}

type MailpitSearchResponse = {
  total: number
  messages: MailpitMessage[]
}

type MailpitMessageDetail = {
  ID: string
  From: { Name: string; Address: string }
  Subject: string
  Date: string
  Text: string
  HTML: string
}

/** List messages sent to a specific email address using Mailpit search. */
async function listMessages(email: string): Promise<MailpitMessage[]> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    { signal: AbortSignal.timeout(5000) },
  )
  if (!res.ok) throw new Error(`listMessages: ${res.status}`)
  const data = (await res.json()) as MailpitSearchResponse
  return data.messages ?? []
}

/** Get a specific message by ID. */
async function getMessage(id: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`getMessage: ${res.status}`)
  return res.json() as Promise<MailpitMessageDetail>
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
      messages.sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())
      const latest = messages[0]
      if (!latest) throw new Error('Unexpected: empty messages after length check')
      const detail = await getMessage(latest.ID)
      return { HTML: detail.HTML, Text: detail.Text, Subject: detail.Subject }
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

/** Delete all messages in Mailpit. */
export async function clearAllMessages(_email?: string) {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['*'] }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`clearAllMessages: ${res.status}`)
}
