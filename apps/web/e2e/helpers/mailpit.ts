const MAILPIT_URL = 'http://127.0.0.1:54324'

type MailpitMessage = {
  ID: string
  From: { Name: string; Address: string }
  To: Array<{ Name: string; Address: string }>
  Subject: string
  Created: string
  Snippet: string
}

type MailpitMessageDetail = {
  ID: string
  From: { Name: string; Address: string }
  Subject: string
  Text: string
  HTML: string
}

type MailpitSearchResult = {
  total: number
  messages: MailpitMessage[]
}

/** Search messages by recipient email. */
async function searchMessages(email: string): Promise<MailpitMessage[]> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=10`,
  )
  if (!res.ok) throw new Error(`searchMessages: ${res.status}`)
  const data = (await res.json()) as MailpitSearchResult
  return data.messages
}

/** Get a specific message by ID. */
async function getMessage(id: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`getMessage: ${res.status}`)
  return res.json() as Promise<MailpitMessageDetail>
}

/** Get the latest email for a given address. Retries up to 10 seconds. */
export async function getLatestEmail(email: string): Promise<MailpitMessageDetail> {
  const maxWait = 10_000
  const interval = 500
  let elapsed = 0

  while (elapsed < maxWait) {
    const messages = await searchMessages(email)
    if (messages.length > 0) {
      // Sort by Created descending to get latest
      messages.sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())
      const latest = messages[0]
      if (!latest) throw new Error('Unexpected: empty messages after length check')
      return getMessage(latest.ID)
    }
    await new Promise((r) => setTimeout(r, interval))
    elapsed += interval
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

/** Delete all messages (clear all mailboxes). */
export async function clearAllMessages() {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`clearAllMessages: ${res.status}`)
}
