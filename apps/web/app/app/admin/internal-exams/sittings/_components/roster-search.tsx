'use client'

import { useEffect, useState } from 'react'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { Input } from '@/components/ui/input'
import { useSittingUi } from '../_hooks/sitting-ui-context'

/** Debounced (300 ms) search; writes `q` and drops `page`. */
export function RosterSearch({ value }: Readonly<{ value: string }>) {
  const update = useUpdateSearchParams()
  const { searchDraft } = useSittingUi()
  const [text, setText] = useState(value)
  useEffect(() => {
    if (text.trim() === value) {
      if (searchDraft) searchDraft.current = null
      return
    }
    if (searchDraft) searchDraft.current = text
    const t = setTimeout(() => {
      if (searchDraft && searchDraft.current === null) return
      update({ q: text.trim() || null, page: null })
    }, 300)
    return () => clearTimeout(t)
  }, [text, value, update, searchDraft])
  return (
    <Input
      aria-label="Search people in this sitting"
      placeholder="Search people…"
      className="w-col-lg"
      value={text}
      maxLength={100}
      onChange={(e) => setText(e.target.value)}
    />
  )
}
