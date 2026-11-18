'use client'

import { Button } from '@/components/ui/button'
import { useSittingUi } from '../_hooks/sitting-ui-context'

type Props = { variant?: 'default' | 'outline'; size?: 'default' | 'sm' }

/** Opens the Add people popup with a fresh tick set. */
export function AddPeopleButton({ variant = 'outline', size = 'sm' }: Readonly<Props>) {
  const { open, people, isRefreshing } = useSittingUi()
  return (
    <Button
      variant={variant}
      size={size}
      disabled={isRefreshing}
      onClick={(e) => {
        people.clear()
        open('people', e.currentTarget)
      }}
    >
      Add people
    </Button>
  )
}
