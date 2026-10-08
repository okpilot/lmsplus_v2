type DomGuardFallback = 'remove' | 'insert'
type Report = (kind: DomGuardFallback) => void

let activeUninstall: (() => void) | null = null

function isFont(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'font'
}

/** The <font> directly under `parent` that wraps `node`, when every layer in between is a <font>. */
function fontWrapperUnder(parent: Node, node: Node): Node | null {
  let wrapper = node.parentNode
  while (wrapper && isFont(wrapper)) {
    if (wrapper.parentNode === parent) return wrapper
    wrapper = wrapper.parentNode
  }
  return null
}

function isDetachedText(node: Node): boolean {
  return node.parentNode === null && node.nodeType === Node.TEXT_NODE
}

function reportOnce(onFallback: Report | undefined): Report {
  const reported = new Set<DomGuardFallback>()
  return (kind: DomGuardFallback) => {
    if (reported.has(kind)) return
    reported.add(kind)
    onFallback?.(kind)
  }
}

function guardRemove(removeChild: Node['removeChild'], report: Report) {
  return function guardedRemoveChild<T extends Node>(this: Node, ...args: [child: T]) {
    const [child] = args
    if (child == null || child.parentNode === this) return removeChild.apply(this, args) as T
    if (isDetachedText(child)) {
      report('remove')
      return child
    }
    const wrapper = fontWrapperUnder(this, child)
    if (!wrapper) return removeChild.apply(this, args) as T
    report('remove')
    removeChild.call(this, wrapper)
    return child
  }
}

function guardInsert(insertBefore: Node['insertBefore'], report: Report) {
  return function guardedInsertBefore<T extends Node>(
    this: Node,
    ...args: [node: T, ref: Node | null]
  ) {
    const [node, ref] = args
    if (!ref || ref.parentNode === this) return insertBefore.apply(this, args) as T
    const detached = isDetachedText(ref)
    const anchor = detached ? null : fontWrapperUnder(this, ref)
    if (!anchor && !detached) return insertBefore.apply(this, args) as T
    report('insert')
    return insertBefore.call(this, node, anchor) as T
  }
}

/**
 * Browser translators wrap React-owned text nodes in <font><font>, or replace them, so React's later
 * removeChild/insertBefore hits a node that is no longer where it left it and throws.
 * Tolerated: a node wrapped only in <font> layers (the wrapper is removed / inserted before), and a
 * detached text node (removal is a no-op and leaves the translated text; an insert appends).
 * Every other mismatch throws natively. `onFallback` hears about each tolerated kind once per install.
 */
export function installTranslatorDomGuard(onFallback?: Report): () => void {
  if (activeUninstall) return activeUninstall
  const { removeChild, insertBefore } = Node.prototype
  const report = reportOnce(onFallback)

  Node.prototype.removeChild = guardRemove(removeChild, report)
  Node.prototype.insertBefore = guardInsert(insertBefore, report)

  activeUninstall = () => {
    Node.prototype.removeChild = removeChild
    Node.prototype.insertBefore = insertBefore
    activeUninstall = null
  }
  return activeUninstall
}
