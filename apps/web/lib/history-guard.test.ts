import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Guard = typeof import('./history-guard')

const TOKEN_KEY = '__lms_nav_tok'
const INDEX_KEY = '__lms_nav_idx'

const proto = Object.getPrototypeOf(window.history) as History
const originals = { push: proto.pushState, replace: proto.replaceState }
let listeners: Array<[string, EventListener]> = []
let go: ReturnType<typeof vi.spyOn>
let protoReplace: ReturnType<typeof vi.spyOn>

async function load(): Promise<Guard> {
  vi.resetModules()
  const mod = (await import('./history-guard')) as Guard
  mod.installHistoryGuard()
  protoReplace.mockClear()
  return mod
}

function token(): string {
  return (window.history.state as Record<string, string>)[TOKEN_KEY] ?? ''
}

function stamped(index: number, tok = token()) {
  return { __NA: true, [TOKEN_KEY]: tok, [INDEX_KEY]: index }
}

/** Dispatches a popstate and returns the spy of a listener registered AFTER the guard's. */
function pop(state: unknown) {
  const downstream = vi.fn()
  window.addEventListener('popstate', downstream)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
  window.removeEventListener('popstate', downstream)
  return downstream
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners = []
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation(((
    type: string,
    fn: EventListener,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    listeners.push([type, fn])
    add(type, fn, opts)
  }) as typeof window.addEventListener)
  go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
  protoReplace = vi.spyOn(proto, 'replaceState')
  window.history.replaceState({ __NA: true, tree: 'x' }, '', '/start')
})

afterEach(() => {
  vi.useRealTimers()
  for (const [type, fn] of listeners) window.removeEventListener(type, fn)
  proto.pushState = originals.push
  proto.replaceState = originals.replace
  Reflect.deleteProperty(window.history, 'pushState')
  Reflect.deleteProperty(window.history, 'replaceState')
})

describe('history stamping', () => {
  it('stamps the entry that is current when installed, keeping Next state', async () => {
    await load()
    expect(window.history.state).toMatchObject({ __NA: true, tree: 'x', [INDEX_KEY]: 0 })
    expect(token()).toBeTruthy()
  })

  it('gives a pushed entry the next index and keeps the state it was given', async () => {
    await load()
    const tok = token()
    window.history.pushState({ __NA: true, tree: 'y' }, '', '/a')
    expect(window.history.state).toEqual({
      __NA: true,
      tree: 'y',
      [TOKEN_KEY]: tok,
      [INDEX_KEY]: 1,
    })
    window.history.pushState({ __NA: true }, '', '/b')
    expect(window.history.state[INDEX_KEY]).toBe(2)
  })

  it('keeps the index of a replaced entry', async () => {
    await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.replaceState({ __NA: true, tree: 'z' }, '', '/a?x=1')
    expect(window.history.state).toMatchObject({ __NA: true, tree: 'z', [INDEX_KEY]: 1 })
  })

  async function renderedAtTwo() {
    const mod = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    mod.armHistoryGuard(vi.fn())
    return mod
  }

  it('holds a replace made while a Back is being reverted until the runner entry is back', async () => {
    await renderedAtTwo()
    pop(stamped(1))
    protoReplace.mockClear()
    window.history.replaceState({ __NA: true }, '', '/x')
    expect(window.location.pathname).toBe('/b')
    expect(protoReplace).not.toHaveBeenCalled()
    pop(stamped(2))
    expect(window.location.pathname).toBe('/x')
    expect(window.history.state[INDEX_KEY]).toBe(2)
  })

  it('holds a replace made during a capped burst until the settle lands', async () => {
    await renderedAtTwo()
    for (const i of [1, 0, 1, 0, 0]) pop(stamped(i))
    window.history.replaceState({ __NA: true }, '', '/x')
    expect(window.location.pathname).toBe('/b')
    vi.advanceTimersByTime(100)
    expect(go).toHaveBeenLastCalledWith(2)
    pop(stamped(2))
    expect(window.location.pathname).toBe('/x')
    expect(window.history.state[INDEX_KEY]).toBe(2)
  })

  it('holds a push made while a revert is in flight and pushes it from the runner entry', async () => {
    await renderedAtTwo()
    pop(stamped(1))
    window.history.pushState({ __NA: true }, '', '/y')
    expect(window.location.pathname).toBe('/b')
    pop(stamped(2))
    expect(window.location.pathname).toBe('/y')
    expect(window.history.state[INDEX_KEY]).toBe(3)
  })

  it('applies held writes in the order they were made', async () => {
    await renderedAtTwo()
    pop(stamped(1))
    window.history.pushState({ __NA: true }, '', '/y')
    window.history.replaceState({ __NA: true }, '', '/z')
    pop(stamped(2))
    expect(window.location.pathname).toBe('/z')
    expect(window.history.state[INDEX_KEY]).toBe(3)
  })

  it('applies a held write on its own when the browser never returns to the runner entry', async () => {
    await renderedAtTwo()
    pop(stamped(1))
    window.history.replaceState({ __NA: true }, '', '/x')
    expect(window.location.pathname).toBe('/b')
    vi.advanceTimersByTime(1000)
    expect(window.location.pathname).toBe('/x')
    expect(window.history.state[INDEX_KEY]).toBe(2)
  })

  it('drops held writes when an outside entry is adopted', async () => {
    await renderedAtTwo()
    pop(stamped(1))
    window.history.replaceState({ __NA: true }, '', '/x')
    pop({ __NA: true })
    vi.advanceTimersByTime(1000)
    expect(window.location.pathname).toBe('/b')
  })

  it('drops held writes when an unarmed guard lets a Back through', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    const disarm = armHistoryGuard(vi.fn())
    pop(stamped(1))
    window.history.replaceState({ __NA: true }, '', '/x')
    disarm()
    pop(stamped(0))
    vi.advanceTimersByTime(1000)
    expect(window.location.pathname).toBe('/b')
  })

  it('keeps held writes when the guard is disarmed during a revert and applies them on return', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    const disarm = armHistoryGuard(vi.fn())
    pop(stamped(1))
    window.history.replaceState({ __NA: true }, '', '/x')
    disarm()
    expect(go).toHaveBeenCalledTimes(1)
    pop(stamped(2))
    expect(window.location.pathname).toBe('/x')
  })

  it('restores the index and token from a reloaded entry', async () => {
    window.history.replaceState({ __NA: true, [TOKEN_KEY]: 'tab', [INDEX_KEY]: 4 }, '', '/r')
    await load()
    window.history.pushState({ __NA: true }, '', '/s')
    expect(window.history.state).toMatchObject({ [TOKEN_KEY]: 'tab', [INDEX_KEY]: 5 })
  })
})

describe('decidePopState', () => {
  const current = { token: 'tab', index: 3 }

  it('adopts an entry without a stamp, keeping nothing of the old token', async () => {
    const { decidePopState } = await load()
    const d = decidePopState({ __NA: true }, current)
    expect(d).toMatchObject({ kind: 'adopt', index: 0 })
    expect(d.kind === 'adopt' && d.token).not.toBe('tab')
  })

  it('adopts a null state', async () => {
    const { decidePopState } = await load()
    expect(decidePopState(null, current).kind).toBe('adopt')
  })

  it('adopts an entry of another token with that entry token and index', async () => {
    const { decidePopState } = await load()
    const state = { __NA: true, [TOKEN_KEY]: 'other', [INDEX_KEY]: 7 }
    expect(decidePopState(state, current)).toEqual({ kind: 'adopt', token: 'other', index: 7 })
  })

  it('reports the signed distance to an entry of the same token', async () => {
    const { decidePopState } = await load()
    const back = { __NA: true, [TOKEN_KEY]: 'tab', [INDEX_KEY]: 2 }
    expect(decidePopState(back, current)).toEqual({ kind: 'move', index: 2, delta: -1 })
  })
})

describe('armed Back and Forward', () => {
  // CONTROL: red
  it('cancels an armed Back, reverts it and reports the attempt', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    const downstream = pop(stamped(0))
    expect(go).toHaveBeenCalledExactlyOnceWith(1)
    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(downstream).not.toHaveBeenCalled()
  })

  it('cancels an armed Forward by stepping back', async () => {
    const { armHistoryGuard } = await load()
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    const downstream = pop(stamped(1))
    expect(go).toHaveBeenCalledExactlyOnceWith(-1)
    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(downstream).not.toHaveBeenCalled()
  })

  it('steps back over several entries when Back jumped more than one', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    armHistoryGuard(vi.fn())
    pop(stamped(0))
    expect(go).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('swallows its own revert without reporting another attempt', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    pop(stamped(0))
    const downstream = pop(stamped(1))
    expect(downstream).not.toHaveBeenCalled()
    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('guards the next Back once the previous revert has landed', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    pop(stamped(0))
    pop(stamped(1))
    pop(stamped(0))
    expect(onAttempt).toHaveBeenCalledTimes(2)
    expect(go).toHaveBeenCalledTimes(2)
  })

  it('reverts each event of a fast burst and stops at the entry it left', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    for (const idx of [1, 0, 1, 3]) expect(pop(stamped(idx))).not.toHaveBeenCalled()
    expect(go.mock.calls.map((c: unknown[]) => c[0])).toEqual([1, 2, 1, -1])
    expect(onAttempt).toHaveBeenCalledTimes(4)
    expect(pop(stamped(2))).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledTimes(4)
  })

  it('passes a later disarmed Back through after a fast burst', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    const disarm = armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1]) pop(stamped(idx))
    pop(stamped(2))
    disarm()
    expect(pop(stamped(1))).toHaveBeenCalledTimes(1)
  })

  it('keeps a five-step Back burst inside the runner', async () => {
    const { armHistoryGuard } = await load()
    for (const p of ['/a', '/b', '/c', '/d', '/e']) window.history.pushState({ __NA: true }, '', p)
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    for (const idx of [4, 3, 2, 1, 0, 1, 2]) expect(pop(stamped(idx))).not.toHaveBeenCalled()
    expect(onAttempt).toHaveBeenCalledTimes(7)
  })

  it('guards a second burst after the first one overshot', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1, 0, 1, 0, 1]) expect(pop(stamped(idx))).not.toHaveBeenCalled()
  })

  it('settles back to the rendered entry once the burst goes quiet', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1, 0, 1, 0]) pop(stamped(idx))
    expect(go).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(100)
    expect(go).toHaveBeenCalledTimes(5)
    expect(go).toHaveBeenLastCalledWith(2)
    vi.advanceTimersByTime(1000)
    expect(go).toHaveBeenCalledTimes(5)
  })

  it('cancels the pending settle when the rendered entry is reached', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1, 0, 1]) pop(stamped(idx))
    pop(stamped(2))
    vi.advanceTimersByTime(1000)
    expect(go).toHaveBeenCalledTimes(4)
  })

  it('returns to the runner entry when disarmed during a capped burst', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    const disarm = armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1, 0, 1]) pop(stamped(idx))
    disarm()
    expect(go).toHaveBeenCalledTimes(5)
    expect(go).toHaveBeenLastCalledWith(1)
    vi.advanceTimersByTime(1000)
    expect(go).toHaveBeenCalledTimes(5)
  })

  it('restarts the revert count after the entry it left is reached again', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    window.history.pushState({ __NA: true }, '', '/b')
    armHistoryGuard(vi.fn())
    for (const idx of [1, 0, 1]) pop(stamped(idx))
    pop(stamped(2))
    for (const idx of [1, 0, 1, 0]) expect(pop(stamped(idx))).not.toHaveBeenCalled()
    expect(go).toHaveBeenCalledTimes(7)
  })

  it('ignores a stray event for the entry it is already on', async () => {
    const { armHistoryGuard } = await load()
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    const downstream = pop(stamped(0))
    expect(downstream).not.toHaveBeenCalled()
    expect(onAttempt).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })
})

describe('unarmed navigation', () => {
  // CONTROL: green
  it('lets a Back through to Next when nothing is armed', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const downstream = pop(stamped(0))
    expect(downstream).toHaveBeenCalledTimes(1)
    expect(go).not.toHaveBeenCalled()
    armHistoryGuard(vi.fn())
  })

  it('tracks the entry it let through, so a later armed Back measures from there', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    pop(stamped(0))
    armHistoryGuard(vi.fn())
    pop(stamped(1))
    expect(go).toHaveBeenCalledExactlyOnceWith(-1)
  })

  it('lets a disarmed guard pass Back through', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const onAttempt = vi.fn()
    const disarm = armHistoryGuard(onAttempt)
    disarm()
    const downstream = pop(stamped(0))
    expect(downstream).toHaveBeenCalledTimes(1)
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('ignores a disarm that belongs to a replaced callback', async () => {
    const { armHistoryGuard } = await load()
    window.history.pushState({ __NA: true }, '', '/a')
    const first = armHistoryGuard(vi.fn())
    const onAttempt = vi.fn()
    armHistoryGuard(onAttempt)
    first()
    pop(stamped(0))
    expect(onAttempt).toHaveBeenCalledTimes(1)
  })
})

describe('entries outside the guard', () => {
  it('passes an entry of another token through and adopts it', async () => {
    const { armHistoryGuard } = await load()
    armHistoryGuard(vi.fn())
    const foreign = { __NA: true, [TOKEN_KEY]: 'other', [INDEX_KEY]: 7 }
    expect(pop(foreign)).toHaveBeenCalledTimes(1)
    pop({ ...foreign, [INDEX_KEY]: 6 })
    expect(go).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('passes a null state through without rewriting history', async () => {
    const { armHistoryGuard } = await load()
    armHistoryGuard(vi.fn())
    expect(pop(null)).toHaveBeenCalledTimes(1)
    expect(protoReplace).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })

  it('passes an entry without a stamp through without rewriting history', async () => {
    await load()
    expect(pop({ __NA: true })).toHaveBeenCalledTimes(1)
    expect(protoReplace).not.toHaveBeenCalled()
  })
})
