import { ADMIN_NAV_ITEMS, isActivePath, NAV_ITEMS, type NavItem } from './nav-items'
import { splitTabs } from './split-tabs'

export type TabBarModel = {
  visible: NavItem[]
  hidden: NavItem[]
  activeHref: string | undefined
  moreActive: boolean
}

/** Tab items for the role, split by available slots, with the active tab resolved. */
export function useTabBarModel(
  pathname: string,
  userRole: string | undefined,
  slots: number,
): TabBarModel {
  const items = userRole === 'admin' ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS
  const { visible, hidden } = splitTabs(items, slots)
  const activeHref = items.find((item) => isActivePath(pathname, item.href))?.href
  const moreActive = hidden.some((item) => item.href === activeHref)
  return { visible, hidden, activeHref, moreActive }
}
