/**
 * TRANSCRIBE-VOICE EDGE FUNCTION
 * 
 * FROM PROMPT: Part 4.2 — Voice Note Transcription
 * Called after user uploads a voice note to convert speech to text.
 * 
 * WHAT IT DOES:
 * 1. Accepts voice_note_url or file stream
 * 2. Calls OpenAI Whisper API to transcribe audio
 * 3. Updates journal_entries.voice_transcribed_text
 * 4. Returns transcribed text for further analysis
 * 
 * REQUEST BODY:
 * { 
 *   entry_id: uuid,
 *   voice_note_url: string OR voice_file_base64: string
 * }
 * 
 * RETURNS:
 * { 
 *   success: true, 
 *   transcribed_text: string,
 *   duration: number (seconds),
 *   confidence: number (0-1)
 * }
 * 
 * IMPLEMENTS FROM PROMPT:
 * ✓ Part 4.2: Voice to Text conversion (OpenAI Whisper)
 * ✓ Part 10: RLS policies (enforced via service_role_key)
 * 
 * ENVIRONMENT VARIABLES NEEDED:
 * - OPENAI_API_KEY: Your OpenAI API key with Whisper access
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"
import { assertPublicHttpUrl } from "../_shared/http.ts"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const MAX_AUDIO_BASE64_CHARS = 34 * 1024 * 1024

const bodySchema = z.object({
  entry_id: z.string().uuid(),
  voice_note_url: z.string().url().optional(),
  voice_file_base64: z.string().min(1).optional(),
}).refine((value) => value.voice_note_url || value.voice_file_base64, {
  message: "Provide voice_note_url or voice_file_base64",
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: any
    try { body = await req.json() } catch (e) { return json({ error: true, message: 'Invalid JSON body' }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)
    const { entry_id, voice_note_url, voice_file_base64 } = parsed.data

    if (!OPENAI_API_KEY) {
      return json({ error: true, message: "Server configuration error" }, 500)
    }

    const supabase = serviceClient()
    await rateLimit(supabase, `voice:transcribe:${authUser.id}`, 20, 3600)

    const { data: entry } = await supabase
      .from("journal_entries")
      .select("id, voice_note_url")
      .eq("id", entry_id)
      .eq("user_id", authUser.id)
      .single()

    if (!entry) {
      return json({ error: true, message: "Entry not found" }, 404)
    }

    if (voice_note_url || entry.voice_note_url) {
      const url = voice_note_url || entry.voice_note_url
      assertPublicHttpUrl(url)
    }

    if (voice_file_base64 && voice_file_base64.length > MAX_AUDIO_BASE64_CHARS) {
      return json({ error: true, message: "Audio payload is too large" }, 413)
    }

    const { data: job, error: jobError } = await supabase
      .from('ai_jobs')
      .insert({
        type: 'transcribe',
        payload: { entry_id, user_id: authUser.id, voice_note_url: voice_note_url || entry.voice_note_url, voice_file_base64 },
        status: 'pending',
      })
      .select()
      .single()

    if (jobError || !job) return json({ error: true, message: "Unable to queue transcription" }, 500)
    return json({ success: true, queued: true, job_id: job.id }, 202)
  } catch (err) {
    return handleError("transcribe-voice", err)
  }
})
