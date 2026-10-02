export type NavItem = {
  href: string
  label: string
  icon?:
    | 'home'
    | 'file-question'
    | 'bar-chart'
    | 'book-open'
    | 'list'
    | 'users'
    | 'settings'
    | 'clipboard-check'
    | 'shield-check'
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/app/quiz', label: 'Quiz', icon: 'file-question' },
  { href: '/app/vfr-rt', label: 'VFR RT', icon: 'book-open' },
  { href: '/app/internal-exam', label: 'Internal Exam', icon: 'shield-check' },
  { href: '/app/reports', label: 'Reports', icon: 'bar-chart' },
  { href: '/app/settings', label: 'Settings', icon: 'settings' },
]

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/app/admin/dashboard', label: 'Dashboard', icon: 'bar-chart' },
  { href: '/app/admin/syllabus', label: 'Syllabus', icon: 'book-open' },
  { href: '/app/admin/questions', label: 'Questions', icon: 'list' },
  { href: '/app/admin/students', label: 'Students', icon: 'users' },
  { href: '/app/admin/exam-config', label: 'Exam Config', icon: 'clipboard-check' },
  { href: '/app/admin/internal-exams', label: 'Internal Exams', icon: 'shield-check' },
]

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function pickByHref(hrefs: string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => hrefs.includes(item.href))
}

export const SIDEBAR_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Learn',
    items: pickByHref(['/app/dashboard', '/app/quiz', '/app/vfr-rt', '/app/internal-exam']),
  },
  { label: 'Progress', items: pickByHref(['/app/reports']) },
]

export const SETTINGS_ITEM: NavItem | undefined = NAV_ITEMS.find(
  (item) => item.href === '/app/settings',
)
