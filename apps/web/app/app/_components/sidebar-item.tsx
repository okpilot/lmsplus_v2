import Link from 'next/link'
import { NavIcon } from './nav-icon'
import type { NavItem } from './nav-items'

const ROW_BASE = 'h-9 gap-2.5 rounded-[10px] px-2.5 text-caption'
const INACTIVE = 'text-muted-foreground hover:bg-muted hover:text-foreground'
export const NAV_ACTIVE = 'bg-primary-soft font-medium text-primary-text'

/** Class for non-link rows (Button) that must align with SidebarItem. */
export const ROW_CLASS = `${ROW_BASE} w-full justify-start border-0 font-normal ${INACTIVE} dark:hover:bg-muted`

export function RowIcon({ paths }: Readonly<{ paths: string[] }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export function SidebarItem({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center transition-colors ${ROW_BASE} ${active ? NAV_ACTIVE : INACTIVE}`}
    >
      {item.icon && <NavIcon name={item.icon} className="size-[18px]" />}
      {item.label}
    </Link>
  )
}
