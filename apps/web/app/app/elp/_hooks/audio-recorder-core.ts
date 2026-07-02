/**
 * Helpers for useAudioRecorder — feature detection, MIME-type selection, File
 * construction, and MediaRecorder/stream ref teardown. Kept out of the hook so
 * the hook itself stays under the §1 hook line cap.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

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
  if (recorder) {
    // Null onstop unconditionally: stop() flips state to 'inactive' synchronously but
    // fires the 'stop' event async, so an already-'inactive' recorder may still have a
    // pending onstop that would set state on an unmounted component after teardown.
    recorder.onstop = null
    if (recorder.state !== 'inactive') recorder.stop()
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

export type RecorderRefs = {
  recorderRef: MutableRefObject<MediaRecorder | null>
  streamRef: MutableRefObject<MediaStream | null>
  startedAtRef: MutableRefObject<number>
  urlRef: MutableRefObject<string | null>
  startingRef: MutableRefObject<boolean>
}

/** Builds the runCapture handler set — keeps the state transitions and the
 * "reset() cancelled the pending capture" guard out of the hook body so the hook
 * stays within the §3 function-length limit. */
export function buildCaptureHandlers(
  refs: RecorderRefs,
  setState: Dispatch<SetStateAction<RecorderState>>,
): CaptureHandlers {
  return {
    onRecording: (stream, recorder) => {
      // reset() cleared startingRef while getUserMedia was still pending — cancel
      // this capture instead of overwriting idle state / leaving the mic live.
      if (!refs.startingRef.current) {
        recorder.onstop = null
        recorder.stop()
        for (const track of stream.getTracks()) track.stop()
        return
      }
      refs.streamRef.current = stream
      refs.recorderRef.current = recorder
      refs.startedAtRef.current = Date.now()
      setState((s) => ({ ...s, status: 'recording' }))
    },
    onRecorded: (answerFile) => {
      revokeObjectUrl(refs.urlRef)
      const audioUrl = URL.createObjectURL(answerFile)
      refs.urlRef.current = audioUrl
      releaseMediaStream(refs.streamRef)
      setState({
        status: 'recorded',
        file: answerFile,
        audioUrl,
        durationMs: Date.now() - refs.startedAtRef.current,
        error: null,
      })
    },
    onDenied: () =>
      setState((s) => ({ ...s, status: 'denied', error: 'Microphone access was denied.' })),
    onSettled: () => {
      refs.startingRef.current = false
    },
  }
}
