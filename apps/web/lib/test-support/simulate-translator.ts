/**
 * Mimics Chrome auto-translate: every non-blank text node under `root` is replaced by
 * `<font><font>text</font></font>`, detaching the node React rendered.
 */
export function simulateTranslator(root: Node): void {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  if (!walker) throw new Error('simulateTranslator: root has no ownerDocument')
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.data.trim()) textNodes.push(node)
  }
  for (const node of textNodes) {
    const outer = node.ownerDocument.createElement('font')
    const inner = node.ownerDocument.createElement('font')
    inner.textContent = node.data
    outer.appendChild(inner)
    node.replaceWith(outer)
  }
}
