export type NavItem = {
  href: string
  label: string
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/quiz', label: 'Quiz' },
  { href: '/app/progress', label: 'Progress' },
  { href: '/app/reports', label: 'Reports' },
]

export const ADMIN_NAV_ITEMS: NavItem[] = [{ href: '/app/admin/syllabus', label: 'Syllabus' }]
