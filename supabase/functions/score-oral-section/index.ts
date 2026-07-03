// Edge Function: score-oral-section
//
// Slice-1 AUTHORITATIVE trigger: invoked directly by the app layer —
// submitSectionResponse() (apps/web/app/app/elp/actions/submit-section-response.ts)
// fires triggerSectionScoring() (apps/web/lib/elp/trigger-scoring.ts) via
// next/server's after(), which POSTs here with the x-webhook-secret header.
// Runs OFF the request path so it survives the student's tab closing. Pipeline:
//   audio (service-role download) -> ElevenLabs Scribe (STT) -> Claude (cached
//   rubric, structured 1..6 per descriptor) -> write_oral_section_grade (service-role).
//
// A Supabase Database Webhook on INSERT into oral_exam_section_responses
// (configured in the Dashboard/Management API — NOT in migrations/config.toml,
// so `db reset` does not wire it) is a possible prod-ops alternative trigger —
// this function accepts the same {record} payload shape from either source —
// but it must NOT be wired at the same time as the app-invoke: both firing for
// the same submission would double-transcribe and double-score (double STT +
// LLM billing). Exactly one trigger is active in prod at a time.
//
// The grader RPC is the ONLY sanctioned writer of scores/usage and is idempotent
// on section state ('grading'), so a re-fired request (webhook retry or a
// duplicate app-invoke) is safe. On any failure we flip the section to 'failed'
// and return 200 (so a webhook caller does not hot-retry).
//
// Secrets (supabase secrets set): ELEVENLABS_API_KEY, ANTHROPIC_API_KEY,
// ELP_WEBHOOK_SECRET. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are ambient.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.70.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.70.0/helpers/zod';
import { OutputSchema, RUBRIC_SYSTEM } from './rubric.ts';

interface SectionRecord {
  id: string;
  session_id: string;
  section_no: number;
  audio_path: string;
  duration_ms: number | null;
}

interface WebhookPayload {
  type: string;
  table: string;
  record: SectionRecord;
}

interface UsageEvent {
  event_type: string;
  quantity: number;
  provider: string;
  cost_estimate_micros: number | null;
}

// Opus 4.8 pricing, in micros (1e-6 USD) per token. Cache read = 0.1x input,
// cache write = 1.25x input (per the Anthropic pricing surface).
const LLM_INPUT_MICROS = 5;
const LLM_OUTPUT_MICROS = 25;
const LLM_CACHE_READ_MICROS = 0.5;
const LLM_CACHE_WRITE_MICROS = 6.25;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('ELP_WEBHOOK_SECRET');
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Fail closed: if the shared secret is not configured, reject everything rather
  // than accept unauthenticated scoring requests (each one costs STT + LLM tokens).
  if (!webhookSecret || req.headers.get('x-webhook-secret') !== webhookSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceKey || !elevenKey || !anthropicKey) {
    return jsonResponse({ error: 'missing_configuration' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let record: SectionRecord | undefined;
  try {
    const payload = (await req.json()) as WebhookPayload;
    record = payload.record;
    if (!record?.id || !record.audio_path) {
      return jsonResponse({ error: 'invalid_payload' }, 400);
    }

    // 1. Download the recorded audio (service-role bypasses storage RLS).
    const { data: audioBlob, error: dlError } = await admin.storage
      .from('elp-recordings')
      .download(record.audio_path);
    if (dlError || !audioBlob) {
      throw new Error(`audio_download_failed: ${dlError?.message ?? 'no data'}`);
    }

    // 2. Speech-to-text via ElevenLabs Scribe.
    const stt = await transcribe(audioBlob, elevenKey, record.audio_path);

    // 3. Score the transcript with Claude against the cached rubric.
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const completion = await anthropic.messages.parse({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: [
        { type: 'text', text: RUBRIC_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content:
            `Exam section number: ${record.section_no} of 5.\n\n` +
            `Automatic transcript:\n${stt.transcript}\n\n` +
            `Per-word STT metadata (token, confidence/timing):\n` +
            `${JSON.stringify(stt.words).slice(0, 12000)}\n\n` +
            `Rate all six descriptors (Levels 1–6) with concrete evidence.`,
        },
      ],
      output_config: { format: zodOutputFormat(OutputSchema) },
    });

    const parsed = completion.parsed_output;
    if (!parsed) {
      throw new Error('llm_parse_failed');
    }

    // 4. Metering — computed from the ACTUAL provider responses, never client input.
    const usage = buildUsage(stt.seconds, completion.usage);

    // 5. Persist atomically via the grader RPC (idempotent on section state).
    const { data: gradeResult, error: gradeError } = await admin.rpc('write_oral_section_grade', {
      p_response_id: record.id,
      p_transcript: stt.transcript,
      p_transcript_meta: { words: stt.words, language: stt.language },
      p_descriptor_scores: parsed.scores,
      p_usage: usage,
    });
    if (gradeError) {
      throw new Error(`grade_write_failed: ${gradeError.message}`);
    }

    return jsonResponse({ ok: true, result: gradeResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[score-oral-section] failed:', message);
    if (record?.id) {
      const { error: failError } = await admin
        .from('oral_exam_section_responses')
        .update({ status: 'failed' })
        .eq('id', record.id)
        .eq('status', 'grading')
        .select('id');
      if (failError) {
        console.error('[score-oral-section] could not mark section failed:', failError.message);
      }
    }
    // 200 so the DB webhook does not hot-retry; the section is now 'failed'.
    // LIMITATION (Slice 0): a permanently 'failed' section blocks finalization
    // (no report) with no re-grade/resubmit path. A recovery flow (reset to
    // 'grading' + re-fire, or student resubmit) is a later-slice follow-up.
    return jsonResponse({ ok: false, error: message });
  }
});

interface Transcription {
  transcript: string;
  words: unknown[];
  seconds: number;
  language: string | null;
}

async function transcribe(audio: Blob, apiKey: string, audioPath: string): Promise<Transcription> {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  // Scribe filename ext from the storage key's real container, not hardcoded webm (#1068).
  const ext = audioPath.split('.').pop() || 'webm';
  form.append('file', audio, `answer.${ext}`);
  form.append('timestamps_granularity', 'word');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`stt_failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    text?: string;
    language_code?: string;
    words?: Array<{ end?: number }>;
  };
  const words = Array.isArray(data.words) ? data.words : [];
  // Duration ≈ end timestamp of the last word (seconds).
  const seconds = words.length > 0 ? Number(words[words.length - 1]?.end ?? 0) : 0;
  return {
    transcript: data.text ?? '',
    words,
    seconds,
    language: data.language_code ?? null,
  };
}

interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function buildUsage(sttSeconds: number, llm: LlmUsage): UsageEvent[] {
  const inputTokens = llm.input_tokens ?? 0;
  const outputTokens = llm.output_tokens ?? 0;
  const cacheRead = llm.cache_read_input_tokens ?? 0;
  const cacheWrite = llm.cache_creation_input_tokens ?? 0;

  const inputCost = Math.round(
    inputTokens * LLM_INPUT_MICROS +
      cacheRead * LLM_CACHE_READ_MICROS +
      cacheWrite * LLM_CACHE_WRITE_MICROS,
  );
  const outputCost = Math.round(outputTokens * LLM_OUTPUT_MICROS);

  return [
    {
      event_type: 'stt_seconds',
      quantity: Math.max(0, Math.round(sttSeconds)),
      provider: 'elevenlabs',
      cost_estimate_micros: null,
    },
    {
      event_type: 'llm_input_tokens',
      quantity: inputTokens + cacheRead + cacheWrite,
      provider: 'anthropic',
      cost_estimate_micros: inputCost,
    },
    {
      event_type: 'llm_output_tokens',
      quantity: outputTokens,
      provider: 'anthropic',
      cost_estimate_micros: outputCost,
    },
  ];
}
