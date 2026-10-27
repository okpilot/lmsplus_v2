import {
  ADMIN_NAV_ITEMS,
  isActivePath,
  NAV_ITEMS,
  type NavItem,
  type NavViewer,
  visibleNavItems,
} from './nav-items'
import { splitTabs } from './split-tabs'

export type TabBarModel = {
  visible: NavItem[]
  hidden: NavItem[]
  activeHref: string | undefined
  moreActive: boolean
}

/** Tab items for the viewer, split by available slots, with the active tab resolved. */
export function useTabBarModel(
  pathname: string,
  state: NavViewer | undefined,
  slots: number,
): TabBarModel {
  // Until the viewer resolves, VFR RT stays hidden (matches the sidebar).
  const viewer = state ?? { userRole: 'student', courseCodes: [] }
  const base = visibleNavItems(NAV_ITEMS, viewer)
  const items = viewer.userRole === 'admin' ? [...base, ...ADMIN_NAV_ITEMS] : base
  const { visible, hidden } = splitTabs(items, slots)
  const activeHref = items.find((item) => isActivePath(pathname, item.href))?.href
  const moreActive = hidden.some((item) => item.href === activeHref)
  return { visible, hidden, activeHref, moreActive }
}
