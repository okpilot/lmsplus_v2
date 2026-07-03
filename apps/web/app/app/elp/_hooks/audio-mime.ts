/**
 * Maps a recorded MediaRecorder MIME type to the base MIME type + file
 * extension used for the upload File and the storage key. Kept as a
 * standalone util (not inlined in audio-recorder-core.ts) so the Edge
 * Function's ext-derivation logic and the client's File-building logic can
 * both cite the same base->ext table if they ever need to (Deno can't import
 * this module directly today, but the mapping stays documented in one place).
 */

const BASE_MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
}

/** Bucket-safe fallback for a MIME type we don't recognize. The storage
 * bucket allowlist is ['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav']
 * and the upload sends `contentType: file.type` — an unrecognized base type
 * would be REJECTED by the bucket where the old hardcoded 'audio/webm' always
 * passed. Falling back to webm mislabels a genuinely exotic container, but
 * preserves upload success, which matches today's behavior for the unknown case. */
const FALLBACK = { baseMime: 'audio/webm', ext: 'webm' } as const

/**
 * Parses a MediaRecorder-reported MIME type (which may carry codec params,
 * e.g. `audio/webm;codecs=opus` or `audio/mp4; codecs=mp4a.40.2` — Safari can
 * emit a space after the semicolon) into the stripped base MIME type and the
 * file extension to use for the upload File / storage key.
 *
 * Unknown base types fall back to `audio/webm` / `webm` (see FALLBACK) rather
 * than passing the unrecognized base through, so the upload never fails the
 * bucket's MIME allowlist.
 */
export function parseAudioMime(recorded: string): { baseMime: string; ext: string } {
  const base = (recorded.split(';')[0] ?? '').trim().toLowerCase()
  const ext = BASE_MIME_TO_EXT[base]
  if (!ext) return FALLBACK
  return { baseMime: base, ext }
}
