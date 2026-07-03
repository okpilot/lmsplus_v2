/**
 * Author-run script: generates the §1 interview prompt mp3 files from
 * `INTERVIEW_PROMPTS` (apps/web/app/app/elp/prompts.ts) via ElevenLabs TTS.
 *
 * NOT run at build/runtime — this is a one-off/occasional content-generation
 * step. Re-run whenever a prompt's `text` changes, then commit the resulting
 * mp3(s) under apps/web/public/elp/prompts/ separately.
 *
 * Requires: ELEVENLABS_API_KEY (from apps/web/.env.local or the shell env).
 * Optional: ELEVENLABS_VOICE_ID (defaults to the ElevenLabs "Rachel" preset
 * voice), ELEVENLABS_MODEL_ID (defaults to eleven_multilingual_v2).
 *
 * Usage: cd apps/web && npx tsx scripts/generate-elp-prompts.ts
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { INTERVIEW_PROMPTS } from '../app/app/elp/prompts'

config({ path: resolve(__dirname, '../.env.local') })

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM' // "Rachel" preset voice
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2'
const OUTPUT_DIR = resolve(__dirname, '../public/elp/prompts')

if (!ELEVENLABS_API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY (set it in apps/web/.env.local or the shell env).')
  process.exit(1)
}

async function synthesize(text: string): Promise<ArrayBuffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body || response.statusText}`)
  }
  return response.arrayBuffer()
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  for (const prompt of INTERVIEW_PROMPTS) {
    console.log(`Generating ${prompt.id}.mp3...`)
    const audio = await synthesize(prompt.text)
    const outPath = resolve(OUTPUT_DIR, `${prompt.id}.mp3`)
    await writeFile(outPath, Buffer.from(audio))
    console.log(`  wrote ${outPath} (${audio.byteLength} bytes)`)
  }
  console.log(`Done. Generated ${INTERVIEW_PROMPTS.length} prompt(s) into ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error('[generate-elp-prompts] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
