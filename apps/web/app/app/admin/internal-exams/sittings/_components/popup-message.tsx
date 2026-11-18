import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { CloseButton } from './close-button'
import { PopupFooter, PopupHeader } from './popup-parts'

type Props = { title: string; message: string }

/** A popup with nothing to act on: title, one sentence, Close. */
export function PopupMessage({ title, message }: Readonly<Props>) {
  return (
    <>
      <PopupHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </PopupHeader>
      <PopupFooter>
        <CloseButton />
      </PopupFooter>
    </>
  )
}

/** The sitting closed or its day ended while the popup was open or being opened. */
export function PopupEnded({ title }: Readonly<{ title: string }>) {
  return <PopupMessage title={title} message="This sitting has ended." />
}
