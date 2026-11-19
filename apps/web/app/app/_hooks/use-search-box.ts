'use client'

import { useEffect, useRef, useState } from 'react'
import type { useUpdateSearchParams } from './use-update-search-params'

type Update = ReturnType<typeof useUpdateSearchParams>

type Keys = { key: string; pageKey: string }

const DEBOUNCE_MS = 300

/**
 * Search box: typing is debounced into the URL param `key` (and clears `pageKey`); the URL
 * re-syncs the box unless typing is pending. `takePending()` flushes pending typing into a
 * sibling filter update.
 */
export function useSearchBox(urlValue: string | undefined, update: Update, keys: Keys) {
  const { key, pageKey } = keys
  const [text, setText] = useState(urlValue ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => {
    if (!timer.current) {
      setText((prev) => (prev.trim() === (urlValue ?? '') ? prev : (urlValue ?? '')))
    }
  }, [urlValue])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const onType = (v: string) => {
    setText(v)
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      update({ [key]: v.trim() || null, [pageKey]: null })
    }, DEBOUNCE_MS)
  }
  const reset = () => {
    cancel()
    setText('')
  }
  const takePending = (): Record<string, string | null> => {
    if (!timer.current) return {}
    cancel()
    return { [key]: text.trim() || null }
  }
  return { text, onType, reset, takePending }
}
