import type { Page } from '@playwright/test'

/**
 * Accepts every native `beforeunload` prompt on `page` and leaves other dialogs to their own
 * handlers. The quiz runner arms `beforeunload` for its whole life. Playwright accepts it when the page
 * has no dialog listener; a spec with its own listener needs this. Returns the prompts seen so far.
 */
export function acceptBeforeUnload(page: Page): () => number {
  let seen = 0
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'beforeunload') return
    seen += 1
    dialog.accept().catch(() => {})
  })
  return () => seen
}
