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

/** True when `node` is the first child at every <font> layer between it and `parent`. */
function leadsFontChain(parent: Node, node: Node): boolean {
  for (let n: Node | null = node; n && n.parentNode !== parent; n = n.parentNode) {
    if (n.previousSibling) return false
  }
  return true
}

/** Removes `child` from its <font> layer, then every layer left empty, up to `parent`. */
function removeFromFontChain(parent: Node, child: Node, removeChild: Node['removeChild']) {
  let layer: Node | null = child.parentNode
  if (layer) removeChild.call(layer, child)
  while (layer && layer !== parent && isFont(layer) && !layer.firstChild) {
    const next: Node | null = layer.parentNode
    if (next) removeChild.call(next, layer)
    layer = next
  }
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
    if (!fontWrapperUnder(this, child)) return removeChild.apply(this, args) as T
    report('remove')
    removeFromFontChain(this, child, removeChild)
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
    if (anchor && !leadsFontChain(this, ref))
      return insertBefore.call(ref.parentNode, node, ref) as T
    return insertBefore.call(this, node, anchor) as T
  }
}

/**
 * Browser translators wrap React-owned text nodes in <font><font>, or replace them, so React's later
 * removeChild/insertBefore hits a node that is no longer where it left it and throws.
 * Tolerated: a node wrapped only in <font> layers (removal drops it and any layer left empty; an
 * insert goes before the wrapper, or inside it when the node is not first there), and a
 * detached text node (removal is a no-op and leaves the translated text; an insert appends).
 * Every other mismatch throws natively. `onFallback` hears about each tolerated kind once per install.
 */
export function installTranslatorDomGuard(onFallback?: Report): () => void {
  if (activeUninstall) return activeUninstall
  const { removeChild, insertBefore } = Node.prototype
  const report = reportOnce(onFallback)

  Node.prototype.removeChild = guardRemove(removeChild, report)
  Node.prototype.insertBefore = guardInsert(insertBefore, report)

  const uninstall = () => {
    if (activeUninstall !== uninstall) return
    Node.prototype.removeChild = removeChild
    Node.prototype.insertBefore = insertBefore
    activeUninstall = null
  }
  activeUninstall = uninstall
  return uninstall
}
