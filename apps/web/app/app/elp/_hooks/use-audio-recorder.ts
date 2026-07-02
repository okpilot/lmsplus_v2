'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  INITIAL_RECORDER_STATE,
  isRecordingSupported,
  type RecorderState,
  releaseMediaStream,
  revokeObjectUrl,
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

  const releaseStream = useCallback(() => releaseMediaStream(streamRef), [])
  const revokeUrl = useCallback(() => revokeObjectUrl(urlRef), [])
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
    runCapture({
      onRecording: (stream, recorder) => {
        streamRef.current = stream
        recorderRef.current = recorder
        startedAtRef.current = Date.now()
        setState((s) => ({ ...s, status: 'recording' }))
      },
      onRecorded: (answerFile) => {
        revokeUrl()
        const audioUrl = URL.createObjectURL(answerFile)
        urlRef.current = audioUrl
        releaseStream()
        const durationMs = Date.now() - startedAtRef.current
        setState({ status: 'recorded', file: answerFile, audioUrl, durationMs, error: null })
      },
      onDenied: () =>
        setState((s) => ({ ...s, status: 'denied', error: 'Microphone access was denied.' })),
      onSettled: () => {
        startingRef.current = false
      },
    })
  }, [state.status, releaseStream, revokeUrl])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  const reset = useCallback(() => {
    teardownCapture(recorderRef, streamRef, urlRef)
    setState(INITIAL_RECORDER_STATE)
  }, [])

  return { ...state, start, stop, reset }
}
