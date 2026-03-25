'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { uploadQuestionImage } from '../actions/upload-question-image'

const SUPABASE_STORAGE_ORIGIN = 'https://uepvblipahxizozxvwjn.supabase.co'

function isSafePreviewUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith(SUPABASE_STORAGE_ORIGIN)
}

type Props = {
  label: string
  currentUrl: string | null
  onUploaded: (url: string) => void
  disabled?: boolean
}

export function ImageUploadField({ label, currentUrl, onUploaded, disabled }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [isPending, startTransition] = useTransition()
  const blobUrlRef = useRef<string | null>(null)

  // Revoke blob URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const objectUrl = URL.createObjectURL(file)
    blobUrlRef.current = objectUrl
    setPreview(objectUrl)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('file', file)

      try {
        const result = await uploadQuestionImage(formData)
        if (result.success) {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
          setPreview(result.url)
          onUploaded(result.url)
          toast.success('Image uploaded')
        } else {
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
          setPreview(currentUrl)
          toast.error(result.error)
        }
      } catch {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
        setPreview(currentUrl)
        toast.error('Upload failed')
      }
    })
  }

  function handleRemove() {
    setPreview(null)
    onUploaded('')
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {preview && isSafePreviewUrl(preview) && (
        <div className="relative">
          {/* biome-ignore lint/performance/noImgElement: local blob/URL preview, not optimizable by next/image */}
          <img
            src={preview}
            alt="Upload preview"
            className="max-h-32 rounded border object-contain"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1 h-6 px-2 text-xs"
            onClick={handleRemove}
            disabled={disabled || isPending}
          >
            Remove
          </Button>
        </div>
      )}
      <Input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        disabled={disabled || isPending}
        className="max-w-xs text-xs"
      />
      {isPending && <p className="text-xs text-muted-foreground">Uploading...</p>}
    </div>
  )
}
