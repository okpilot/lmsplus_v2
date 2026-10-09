import { toast } from 'sonner'

export const LIVE_SESSION_PREFIX = '/app/quiz/session'
export const NEW_VERSION_TOAST_ID = 'new-version'

export function isLiveSessionPath(pathname: string): boolean {
  return pathname.startsWith(LIVE_SESSION_PREFIX)
}

export async function fetchDeploymentVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const version = (body as { version?: unknown } | null)?.version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

export function showNewVersionToast(): void {
  toast('A new version is available', {
    id: NEW_VERSION_TOAST_ID,
    duration: Number.POSITIVE_INFINITY,
    action: { label: 'Reload', onClick: () => window.location.reload() },
    cancel: { label: 'Later', onClick: () => {} },
  })
}

export function dismissNewVersionToast(): void {
  toast.dismiss(NEW_VERSION_TOAST_ID)
}
