import { describe, expect, it } from 'vitest'
import { parseAudioMime } from './audio-mime'

describe('parseAudioMime', () => {
  it('maps audio/webm to the webm extension', () => {
    expect(parseAudioMime('audio/webm')).toEqual({ baseMime: 'audio/webm', ext: 'webm' })
  })

  it('maps audio/mp4 to the m4a extension (Safari recordings)', () => {
    expect(parseAudioMime('audio/mp4')).toEqual({ baseMime: 'audio/mp4', ext: 'm4a' })
  })

  it('maps audio/mpeg to the mp3 extension', () => {
    expect(parseAudioMime('audio/mpeg')).toEqual({ baseMime: 'audio/mpeg', ext: 'mp3' })
  })

  it('maps audio/ogg to the ogg extension', () => {
    expect(parseAudioMime('audio/ogg')).toEqual({ baseMime: 'audio/ogg', ext: 'ogg' })
  })

  it('maps audio/wav to the wav extension', () => {
    expect(parseAudioMime('audio/wav')).toEqual({ baseMime: 'audio/wav', ext: 'wav' })
  })

  it('strips codec parameters before mapping', () => {
    expect(parseAudioMime('audio/webm;codecs=opus')).toEqual({
      baseMime: 'audio/webm',
      ext: 'webm',
    })
  })

  it('strips codec parameters with a leading space (Safari mp4 format)', () => {
    expect(parseAudioMime('audio/mp4; codecs=mp4a.40.2')).toEqual({
      baseMime: 'audio/mp4',
      ext: 'm4a',
    })
  })

  it('falls back to webm for an unrecognized container', () => {
    expect(parseAudioMime('audio/3gpp')).toEqual({ baseMime: 'audio/webm', ext: 'webm' })
  })

  it('falls back to webm for an empty string', () => {
    expect(parseAudioMime('')).toEqual({ baseMime: 'audio/webm', ext: 'webm' })
  })
})
