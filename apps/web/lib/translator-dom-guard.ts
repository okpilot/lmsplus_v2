type DomGuardFallback = 'remove' | 'insert'

let activeUninstall: (() => void) | null = null

function wrapperUnder(parent: Node, ref: Node): Node | null {
  let node: Node | null = ref
  while (node && node.parentNode !== parent) node = node.parentNode
  return node
}

function reportOnce(onFallback: ((kind: DomGuardFallback) => void) | undefined) {
  const reported = new Set<DomGuardFallback>()
  return (kind: DomGuardFallback) => {
    if (reported.has(kind)) return
    reported.add(kind)
    onFallback?.(kind)
  }
}

/**
 * Browser translators wrap or replace React-owned text nodes with <font><font>, so React's later
 * removeChild/insertBefore hits a node that is no longer where it left it and throws.
 * Limit: when the node was replaced (detached), removal leaves the translated text and an insert
 * before it appends to the parent.
 * `onFallback` hears about each kind of tolerated mismatch once per install.
 */
export function installTranslatorDomGuard(
  onFallback?: (kind: DomGuardFallback) => void,
): () => void {
  if (activeUninstall) return activeUninstall
  const { removeChild, insertBefore } = Node.prototype
  const report = reportOnce(onFallback)

  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T) {
    if (child.parentNode === this) return removeChild.call(this, child) as T
    report('remove')
    const wrapper = wrapperUnder(this, child)
    if (wrapper) removeChild.call(this, wrapper)
    return child
  }
  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    ref: Node | null,
  ) {
    if (!ref || ref.parentNode === this) return insertBefore.call(this, node, ref) as T
    report('insert')
    return insertBefore.call(this, node, wrapperUnder(this, ref)) as T
  }

  activeUninstall = () => {
    Node.prototype.removeChild = removeChild
    Node.prototype.insertBefore = insertBefore
    activeUninstall = null
  }
  return activeUninstall
}
