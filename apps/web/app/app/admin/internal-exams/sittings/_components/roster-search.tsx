'use client'

import { useEffect, useRef, useState } from 'react'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { Input } from '@/components/ui/input'
import { useSittingUi } from '../_hooks/sitting-ui-context'

/** Debounced (300 ms) search; writes `q` and drops `page`. The URL re-syncs the box unless typing is pending. */
export function RosterSearch({ value }: Readonly<{ value: string }>) {
  const update = useUpdateSearchParams()
  const { searchDraft, clearRoster } = useSittingUi()
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The last query THIS component asked for. The `value` prop only moves once `router.replace`
  // commits, so comparing against it drops a correction typed while a write is in flight.
  const requested = useRef(value)
  useEffect(() => {
    if (timer.current) return
    requested.current = value
    setText((prev) => (prev.trim() === value ? prev : value))
    if (searchDraft) searchDraft.current = null
  }, [value, searchDraft])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (searchDraft) searchDraft.current = null
    },
    [searchDraft],
  )
  const onType = (v: string) => {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    if (searchDraft) searchDraft.current = v
    timer.current = setTimeout(() => {
      timer.current = null
      // The filter consumed our draft and wrote `q` itself. Catch the ref up here: the effect
      // cannot, because it returns early while this timer is armed.
      if (searchDraft && searchDraft.current === null) {
        requested.current = v.trim()
        return
      }
      // Unchanged query: the roster does not move, so the ticks stay. Nothing wrote the URL, so
      // the re-sync effect will not run to clear the draft either.
      if (v.trim() === requested.current) {
        if (searchDraft) searchDraft.current = null
        return
      }
      requested.current = v.trim()
      clearRoster()
      update({ q: v.trim() || null, page: null })
    }, 300)
  }
  return (
    <Input
      aria-label="Search people in this sitting"
      placeholder="Search people…"
      className="w-col-lg"
      value={text}
      maxLength={100}
      onChange={(e) => onType(e.target.value)}
    />
  )
}
