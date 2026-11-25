import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PopupHeader } from './popup-parts'

/** Suspense fallback of a popup body: the header only, so the popup opens at once. */
export function PopupFallback({ title }: Readonly<{ title: string }>) {
  return (
    <PopupHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>Loading...</DialogDescription>
    </PopupHeader>
  )
}
