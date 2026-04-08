export type NavItem = {
  href: string
  label: string
  icon?: 'home' | 'file-question' | 'bar-chart' | 'book-open' | 'list' | 'users' | 'settings'
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/app/quiz', label: 'Quiz', icon: 'file-question' },
  { href: '/app/reports', label: 'Reports', icon: 'bar-chart' },
  { href: '/app/settings', label: 'Settings', icon: 'settings' },
]

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/app/admin/dashboard', label: 'Dashboard', icon: 'bar-chart' },
  { href: '/app/admin/syllabus', label: 'Syllabus', icon: 'book-open' },
  { href: '/app/admin/questions', label: 'Questions', icon: 'list' },
  { href: '/app/admin/students', label: 'Students', icon: 'users' },
]
