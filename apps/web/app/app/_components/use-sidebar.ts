'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setCollapsed(true)
    setHydrated(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return { collapsed: hydrated ? collapsed : false, toggle, hydrated }
}
