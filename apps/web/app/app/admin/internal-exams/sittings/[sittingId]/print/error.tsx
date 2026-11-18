'use client'

import SittingError from '../error'

export default function PrintError(
  props: Readonly<{ error: Error & { digest?: string }; retry: () => void }>,
) {
  return <SittingError {...props} />
}
