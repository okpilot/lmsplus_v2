import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { uploadQuestionImage } from './upload-question-image'

// ---- Helpers ---------------------------------------------------------------

type UploadResult = { error: null } | { error: { message: string } }

const ORG_UUID = '00000000-0000-4000-a000-000000000099'

function buildStorageMock(uploadResult: UploadResult, publicUrl = 'https://cdn.example.com/q.png') {
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
  const upload = vi.fn().mockResolvedValue(uploadResult)
  const fromBucket = vi.fn().mockReturnValue({ upload, getPublicUrl })
  // Mock supabase.from('users') for org resolution
  const fromTable = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { organization_id: ORG_UUID },
          error: null,
        }),
      }),
    }),
  })
  return { storage: { from: fromBucket }, from: fromTable, upload, getPublicUrl, fromBucket }
}

function makeFile(opts: { name?: string; size?: number; type?: string } = {}): File {
  const { name = 'photo.png', size = 1024, type = 'image/png' } = opts
  // File constructor requires an array of parts; we pad with zeros to hit the desired size
  const content = new Uint8Array(size)
  return new File([content], name, { type })
}

function makeFormData(file: File): FormData {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

function mockAdminWithStorage(uploadResult: UploadResult, publicUrl?: string) {
  const mocks = buildStorageMock(uploadResult, publicUrl)
  mockRequireAdmin.mockResolvedValue({
    supabase: { storage: mocks.storage, from: mocks.from },
    userId: 'admin-user-1',
  })
  return mocks
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('uploadQuestionImage', () => {
  describe('input validation', () => {
    it('returns failure when no file is appended to the FormData', async () => {
      const fd = new FormData()
      const result = await uploadQuestionImage(fd)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No file provided')
    })

    it('returns failure when the file field is a plain string, not a File', async () => {
      const fd = new FormData()
      fd.append('file', 'not-a-file')
      const result = await uploadQuestionImage(fd)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No file provided')
    })

    it('returns failure when the file exceeds 2 MB', async () => {
      const bigFile = makeFile({ size: 2 * 1024 * 1024 + 1 })
      const result = await uploadQuestionImage(makeFormData(bigFile))
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('File too large (max 2MB)')
    })

    it('returns failure for a TIFF file type', async () => {
      const tiff = makeFile({ type: 'image/tiff', name: 'photo.tiff' })
      const result = await uploadQuestionImage(makeFormData(tiff))
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid file type (PNG, JPEG, or WebP only)')
    })

    it('returns failure for a PDF file type', async () => {
      const pdf = makeFile({ type: 'application/pdf', name: 'file.pdf' })
      const result = await uploadQuestionImage(makeFormData(pdf))
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid file type (PNG, JPEG, or WebP only)')
    })

    it('does not call requireAdmin when validation fails', async () => {
      await uploadQuestionImage(new FormData())
      expect(mockRequireAdmin).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('returns the public URL after a successful PNG upload', async () => {
      mockAdminWithStorage({ error: null }, 'https://cdn.example.com/uploaded.png')

      const file = makeFile({ name: 'diagram.png', type: 'image/png' })
      const result = await uploadQuestionImage(makeFormData(file))

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.url).toBe('https://cdn.example.com/uploaded.png')
    })

    it('returns the public URL after a successful JPEG upload', async () => {
      mockAdminWithStorage({ error: null }, 'https://cdn.example.com/photo.jpg')

      const file = makeFile({ name: 'photo.jpg', type: 'image/jpeg' })
      const result = await uploadQuestionImage(makeFormData(file))

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.url).toBe('https://cdn.example.com/photo.jpg')
    })

    it('returns the public URL after a successful WebP upload', async () => {
      mockAdminWithStorage({ error: null }, 'https://cdn.example.com/img.webp')

      const file = makeFile({ name: 'img.webp', type: 'image/webp' })
      const result = await uploadQuestionImage(makeFormData(file))

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.url).toBe('https://cdn.example.com/img.webp')
    })

    it('uploads to the question-images bucket with upsert disabled', async () => {
      const { fromBucket, upload } = mockAdminWithStorage({ error: null })

      const file = makeFile()
      await uploadQuestionImage(makeFormData(file))

      expect(fromBucket).toHaveBeenCalledWith('question-images')
      const uploadOpts = upload.mock.calls[0]?.[2] as { upsert: boolean; contentType: string }
      expect(uploadOpts.upsert).toBe(false)
      expect(uploadOpts.contentType).toBe('image/png')
    })

    it('accepts a file exactly at the 2 MB size limit', async () => {
      mockAdminWithStorage({ error: null })

      const file = makeFile({ size: 2 * 1024 * 1024 })
      const result = await uploadQuestionImage(makeFormData(file))

      expect(result.success).toBe(true)
    })
  })

  describe('error paths', () => {
    it('returns failure when the storage upload returns an error', async () => {
      mockAdminWithStorage({ error: { message: 'Bucket quota exceeded' } })

      const file = makeFile()
      const result = await uploadQuestionImage(makeFormData(file))

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Image upload failed')
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      const file = makeFile()
      await expect(uploadQuestionImage(makeFormData(file))).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
