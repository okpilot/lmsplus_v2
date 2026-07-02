/**
 * Helpers for useAudioRecorder — feature detection, MIME-type selection, File
 * construction, and MediaRecorder/stream ref teardown. Kept out of the hook so
 * the hook itself stays under the §1 hook line cap.
 */

import type { MutableRefObject } from 'react'

export type AudioRecorderStatus = 'idle' | 'recording' | 'recorded' | 'denied' | 'unsupported'

export type RecorderState = {
  status: AudioRecorderStatus
  file: File | null
  audioUrl: string | null
  durationMs: number
  error: string | null
}

export const INITIAL_RECORDER_STATE: RecorderState = {
  status: 'idle',
  file: null,
  audioUrl: null,
  durationMs: 0,
  error: null,
}

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

/** True when the current environment can record audio via MediaRecorder. */
export function isRecordingSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === 'function'
}

/** First supported MIME type from the preference list, or undefined to let the
 * browser pick its default (older Safari has no isTypeSupported). */
export function pickAudioMimeType(): string | undefined {
  const isTypeSupported = window.MediaRecorder?.isTypeSupported
  if (typeof isTypeSupported !== 'function') return undefined
  return PREFERRED_MIME_TYPES.find((type) => isTypeSupported(type))
}

/** Builds the upload-ready answer File from recorded chunks. Always normalized
 * to `answer.webm` / `audio/webm` regardless of the source MIME type, matching
 * the shape the submit action's FormData `audio` field expects. */
export function buildAnswerFile(chunks: BlobPart[], recordedMimeType: string): File {
  const blob = new Blob(chunks, { type: recordedMimeType })
  return new File([blob], 'answer.webm', { type: 'audio/webm' })
}

/** Creates, wires, and starts a MediaRecorder against `stream`. Collects chunks
 * internally and hands the built answer File to `onStop` once the recorder
 * stops — keeps chunk-buffering out of the consuming hook. */
export function startRecorderSession(
  stream: MediaStream,
  onStop: (answerFile: File) => void,
): MediaRecorder {
  const chunks: BlobPart[] = []
  const mimeType = pickAudioMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.onstop = () => {
    onStop(buildAnswerFile(chunks, mimeType ?? 'audio/webm'))
  }
  recorder.start()
  return recorder
}

/** Stops every track on the held stream and clears the ref. */
export function releaseMediaStream(streamRef: MutableRefObject<MediaStream | null>): void {
  for (const track of streamRef.current?.getTracks() ?? []) track.stop()
  streamRef.current = null
}

/** Revokes the held blob URL (if any) and clears the ref. */
export function revokeObjectUrl(urlRef: MutableRefObject<string | null>): void {
  if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  urlRef.current = null
}

/** Full capture teardown: discards any in-flight recorder (nulling onstop so its
 * pending answer File is dropped, not delivered), releases the mic stream, and
 * revokes the blob URL. Safe from any state — used by reset() and unmount so a
 * cancel mid-recording cannot later overwrite idle state or leave the mic live. */
export function teardownCapture(
  recorderRef: MutableRefObject<MediaRecorder | null>,
  streamRef: MutableRefObject<MediaStream | null>,
  urlRef: MutableRefObject<string | null>,
): void {
  const recorder = recorderRef.current
  if (recorder && recorder.state !== 'inactive') {
    recorder.onstop = null
    recorder.stop()
  }
  recorderRef.current = null
  releaseMediaStream(streamRef)
  revokeObjectUrl(urlRef)
}

export type CaptureHandlers = {
  onRecording: (stream: MediaStream, recorder: MediaRecorder) => void
  onRecorded: (answerFile: File) => void
  onDenied: () => void
  onSettled: () => void
}

/** Requests the mic, starts a recorder session, and reports the outcome via
 * `handlers` — keeps the getUserMedia promise chain out of the hook body. */
export function runCapture(handlers: CaptureHandlers): void {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const recorder = startRecorderSession(stream, handlers.onRecorded)
      handlers.onRecording(stream, recorder)
    })
    .catch(() => handlers.onDenied())
    .finally(() => handlers.onSettled())
}
