import Link from 'next/link'
import { NavIcon } from './nav-icon'
import type { NavItem } from './nav-items'

const ROW_BASE = 'h-8 gap-2.5 rounded-[10px] px-2.5 text-[13px]'
const INACTIVE = 'text-foreground/65 hover:bg-foreground/[0.04]'
const ACTIVE = 'bg-surface font-medium text-foreground ring-1 ring-surface-ring'

/** Class for non-link rows (Button) that must align with SidebarItem. */
export const ROW_CLASS = `${ROW_BASE} w-full justify-start font-normal ${INACTIVE}`

export function RowIcon({ paths }: Readonly<{ paths: string[] }>) {
  return (
    <span className="opacity-70">
      <svg
        viewBox="0 0 24 24"
        className="size-4"
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
    </span>
  )
}

export function SidebarItem({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center transition-colors ${ROW_BASE} ${active ? ACTIVE : INACTIVE}`}
    >
      {item.icon && (
        <span className={active ? '' : 'opacity-70'}>
          <NavIcon name={item.icon} className="size-4" />
        </span>
      )}
      {item.label}
    </Link>
  )
}
