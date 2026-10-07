let activeUninstall: (() => void) | null = null

function wrapperUnder(parent: Node, ref: Node): Node | null {
  let node: Node | null = ref
  while (node && node.parentNode !== parent) node = node.parentNode
  return node
}

/**
 * Browser translators wrap React-owned text nodes in <font><font>, so React's later
 * removeChild/insertBefore hits a node that is no longer where it left it and throws.
 */
export function installTranslatorDomGuard(): () => void {
  if (activeUninstall) return activeUninstall
  const { removeChild, insertBefore } = Node.prototype

  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T) {
    if (child.parentNode !== this) return child
    return removeChild.call(this, child) as T
  }
  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    ref: Node | null,
  ) {
    if (ref && ref.parentNode !== this) {
      const anchor = wrapperUnder(this, ref)
      return insertBefore.call(this, node, anchor) as T
    }
    return insertBefore.call(this, node, ref) as T
  }

  activeUninstall = () => {
    Node.prototype.removeChild = removeChild
    Node.prototype.insertBefore = insertBefore
    activeUninstall = null
  }
  return activeUninstall
}
