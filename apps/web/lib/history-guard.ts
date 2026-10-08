/**
 * Back/Forward interception by history index, after LayerXcom/next-navigation-guard. Every history
 * entry is stamped with a per-tab token and its index; an armed popstate is cancelled by stepping
 * `history.go` back by the distance travelled. Installed before Next's own patch and popstate
 * listener (see HistoryGuard), so `stopImmediatePropagation` keeps Next from traversing.
 * Every popstate is measured against the unchanged rendered index, so no "revert pending" state
 * exists to get stuck. `onAttempt` may fire once per event of a burst (callers are idempotent).
 * After MAX_REVERTS self-issued `go` calls without reaching the rendered entry (delta 0), the
 * landed entry is accepted, which bounds the ping-pong the reference library can loop in.
 */
const TOKEN_KEY = '__lms_nav_tok'
const INDEX_KEY = '__lms_nav_idx'

type Position = { token: string; index: number }
type PopDecision =
  | { kind: 'adopt'; token: string; index: number }
  | { kind: 'move'; index: number; delta: number }

let installed = false
let position: Position = { token: '', index: 0 }
let armed: (() => void) | null = null
let reverts = 0
const MAX_REVERTS = 4

const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

function stampOf(state: unknown): { token?: string; index: number } {
  if (typeof state !== 'object' || state === null) return { index: 0 }
  const s = state as Record<string, unknown>
  const token = typeof s[TOKEN_KEY] === 'string' ? s[TOKEN_KEY] : undefined
  return { token, index: Number(s[INDEX_KEY]) || 0 }
}

/** What a popstate to `state` means from `current`: a foreign entry to adopt, or a move to measure. */
export function decidePopState(state: unknown, current: Position): PopDecision {
  const { token, index } = stampOf(state)
  if (!token || token !== current.token) {
    return { kind: 'adopt', token: token ?? newToken(), index: token ? index : 0 }
  }
  return { kind: 'move', index, delta: index - current.index }
}

function handlePopState(event: PopStateEvent) {
  const d = decidePopState(event.state, position)
  if (d.kind === 'adopt') {
    // In memory only: a stamp without Next's `__NA` makes Next reload on a later traversal.
    position = { token: d.token, index: d.index }
    return
  }
  if (d.delta === 0) {
    reverts = 0
    event.stopImmediatePropagation()
    return
  }
  if (!armed || reverts >= MAX_REVERTS) {
    reverts = 0
    position = { token: position.token, index: d.index }
    return
  }
  event.stopImmediatePropagation()
  reverts += 1
  window.history.go(-d.delta)
  armed()
}

function patchHistory() {
  const push = window.history.pushState
  const replace = window.history.replaceState
  const stamp = (state: unknown) => ({
    ...(state as object | null),
    [TOKEN_KEY]: position.token,
    [INDEX_KEY]: position.index,
  })
  window.history.pushState = function (state, unused, url) {
    position = { token: position.token, index: position.index + 1 }
    push.call(this, stamp(state), unused, url)
  }
  window.history.replaceState = function (state, unused, url) {
    replace.call(this, stamp(state), unused, url)
  }
  return replace
}

/** Idempotent. Must run in a layout effect: before Next's passive effect patches history. */
export function installHistoryGuard() {
  if (installed) return
  installed = true
  const current = window.history.state as unknown
  const { token, index } = stampOf(current)
  position = { token: token ?? newToken(), index }
  const replace = patchHistory()
  if (!token) {
    const stamped = {
      ...(current as object | null),
      [TOKEN_KEY]: position.token,
      [INDEX_KEY]: index,
    }
    replace.call(window.history, stamped, '', window.location.href)
  }
  window.addEventListener('popstate', handlePopState)
}

/** Turns Back/Forward into `onAttempt` until the returned disarm runs. One guard is armed at a time. */
export function armHistoryGuard(onAttempt: () => void): () => void {
  armed = onAttempt
  return () => {
    if (armed === onAttempt) armed = null
  }
}
