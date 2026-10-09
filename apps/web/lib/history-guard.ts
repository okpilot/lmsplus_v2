/**
 * Back/Forward interception by history index, after LayerXcom/next-navigation-guard. Every entry is
 * stamped with a per-tab token and its index; an armed popstate is cancelled by `history.go` back
 * by the distance travelled. Installed before Next's patch and popstate listener (see HistoryGuard),
 * so `stopImmediatePropagation` keeps Next from traversing. Every popstate is measured against the
 * unchanged rendered index, so no "revert pending" state exists to get stuck. `onAttempt` may fire
 * once per burst event (callers are idempotent). After MAX_REVERTS self-issued `go` calls without
 * reaching the rendered entry (delta 0), further events are swallowed, not answered with `go`; once
 * the queue is quiet for SETTLE_MS one `go` returns to the rendered entry. An armed guard never
 * accepts a same-token entry. pushState/replaceState made off the rendered entry are held until the
 * browser is back on it. Known limit: a held write lacking `__NA` copies the earlier state.
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
let landed: number | null = null
// Index of the entry the browser is on; differs from position.index while a revert is pending.
let at = 0
let settleTimer: ReturnType<typeof setTimeout> | undefined
const MAX_REVERTS = 4
const SETTLE_MS = 100
let queued: Array<() => void> = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
const FLUSH_MS = 1000

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

function clearSettle() {
  clearTimeout(settleTimer)
  settleTimer = undefined
  landed = null
  reverts = 0
}

/** Steps from the entry a capped burst parked on back to the rendered one. */
function settle() {
  reverts = 0
  if (landed === null || landed === position.index) return
  const delta = position.index - landed
  landed = null
  window.history.go(delta)
}

function scheduleSettle() {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settleTimer = undefined
    if (armed) settle()
    else reverts = 0
  }, SETTLE_MS)
}

function dropQueued() {
  clearTimeout(flushTimer)
  flushTimer = undefined
  queued = []
}

function flushQueued() {
  const writes = queued
  dropQueued()
  for (const write of writes) write()
}

/** Flushes held writes once the browser is on the rendered entry; stops checking after MAX_REVERTS. */
function waitForReturn(waits: number) {
  flushTimer = undefined
  const { index, token } = stampOf(window.history.state)
  if (index !== position.index || token !== position.token) {
    if (waits < MAX_REVERTS) flushTimer = setTimeout(() => waitForReturn(waits + 1), FLUSH_MS)
    return
  }
  at = position.index
  flushQueued()
}

function hold(write: () => void) {
  queued.push(write)
  flushTimer ??= setTimeout(() => waitForReturn(0), FLUSH_MS)
}

const stamp = (state: unknown, index: number) => ({
  ...(state as object | null),
  [TOKEN_KEY]: position.token,
  [INDEX_KEY]: index,
})

function revertOrPark(d: { index: number; delta: number }) {
  if (reverts >= MAX_REVERTS) {
    landed = d.index
    scheduleSettle()
    return
  }
  reverts += 1
  landed = null
  window.history.go(-d.delta)
}

function handlePopState(event: PopStateEvent) {
  const d = decidePopState(event.state, position)
  at = d.index
  if (d.kind === 'adopt') {
    clearSettle()
    dropQueued()
    // In memory only: a stamp without Next's `__NA` makes Next reload on a later traversal.
    position = { token: d.token, index: d.index }
    return
  }
  if (d.delta === 0) {
    clearSettle()
    event.stopImmediatePropagation()
    flushQueued()
    return
  }
  if (!armed) {
    clearSettle()
    dropQueued()
    position = { token: position.token, index: d.index }
    return
  }
  event.stopImmediatePropagation()
  revertOrPark(d)
  armed()
}

function patchHistory() {
  const push = window.history.pushState
  const replace = window.history.replaceState
  window.history.pushState = function (state, unused, url) {
    const write = () => {
      clearSettle()
      at += 1
      position = { token: position.token, index: at }
      push.call(this, stamp(state, at), unused, url)
    }
    if (at !== position.index) hold(write)
    else write()
  }
  window.history.replaceState = function (state, unused, url) {
    const write = () => replace.call(this, stamp(state, at), unused, url)
    if (at !== position.index) hold(write)
    else write()
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
  at = index
  const replace = patchHistory()
  if (!token) {
    replace.call(window.history, stamp(current, index), '', window.location.href)
  }
  window.addEventListener('popstate', handlePopState)
}

/** Turns Back/Forward into `onAttempt` until the returned disarm runs. One guard is armed at a time. */
export function armHistoryGuard(onAttempt: () => void): () => void {
  armed = onAttempt
  return () => {
    if (armed !== onAttempt) return
    armed = null
    clearTimeout(settleTimer)
    settleTimer = undefined
    settle()
  }
}
