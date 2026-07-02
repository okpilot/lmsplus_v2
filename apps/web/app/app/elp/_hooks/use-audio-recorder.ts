'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildCaptureHandlers,
  INITIAL_RECORDER_STATE,
  isRecordingSupported,
  type RecorderState,
  runCapture,
  teardownCapture,
} from './audio-recorder-core'

export type { AudioRecorderStatus } from './audio-recorder-core'
export type UseAudioRecorderResult = RecorderState & {
  start: () => void
  stop: () => void
  reset: () => void
}
/** Records a mic answer into an upload-ready webm File; denial is a status, not a throw. */
export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>(INITIAL_RECORDER_STATE)
  // Sync one-shot re-entry guard while getUserMedia's prompt is pending (§6).
  const startingRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const urlRef = useRef<string | null>(null)

  // Full teardown on unmount (discard recorder, release mic, revoke URL) — cleanup, not data fetching.
  useEffect(() => {
    return () => teardownCapture(recorderRef, streamRef, urlRef)
  }, [])

  const start = useCallback(() => {
    if (startingRef.current || state.status === 'recording') return
    if (!isRecordingSupported()) {
      setState((s) => ({ ...s, status: 'unsupported' }))
      return
    }
    startingRef.current = true
    setState((s) => ({ ...s, error: null }))
    runCapture(
      buildCaptureHandlers({ recorderRef, streamRef, startedAtRef, urlRef, startingRef }, setState),
    )
  }, [state.status])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  // reset() clears startingRef too, so a still-pending getUserMedia is cancelled:
  // buildCaptureHandlers' onRecording checks startingRef and tears down if it is false.
  const reset = useCallback(() => {
    startingRef.current = false
    teardownCapture(recorderRef, streamRef, urlRef)
    setState(INITIAL_RECORDER_STATE)
  }, [])

  return { ...state, start, stop, reset }
}
