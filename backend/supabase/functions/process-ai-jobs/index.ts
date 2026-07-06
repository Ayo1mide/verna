/**
 * PROCESS-AI-JOBS WORKER
 *
 * Polls the `ai_jobs` queue (claim_ai_job RPC), processes one job, and finishes it.
 * Intended to be invoked periodically (cron) or run as a short-lived worker.
 *
 * Supported job types: 'transform', 'transcribe', 'poem_generate'
 *
 * ENV:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ANTHROPIC_API_KEY
 * - OPENAI_API_KEY
 * - PROCESS_AI_JOBS_SECRET
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.21.0"
import { json } from "../_shared/auth.ts"

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! })
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: true, message: "Method not allowed" }, 405)
  }

  const workerSecret = Deno.env.get("PROCESS_AI_JOBS_SECRET")
  const providedSecret = req.headers.get("x-worker-secret")
  if (!workerSecret || providedSecret !== workerSecret) {
    return json({ error: true, message: "Unauthorized worker request" }, 401)
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  // Claim a job
  const workerName = "verna-worker-1"
  const { data: claimed, error: claimErr } = await supabase.rpc('claim_ai_job', { p_worker: workerName })
  if (claimErr) {
    console.error('claim_ai_job error', claimErr)
    return json({ error: true, message: 'claim failed' }, 500)
  }

  const job = Array.isArray(claimed) ? claimed[0] : claimed
  if (!job) return new Response(null, { status: 204 })

  try {
    if (job.type === 'poem_generate') {
      const payload = job.payload
      const draftId = payload.draft_id

      const { data: draft } = await supabase
        .from('poem_drafts')
        .select('id, user_id, raw_text, mood, style')
        .eq('id', draftId)
        .single()

      if (!draft) throw new Error('draft not found')
      if (payload.user_id && draft.user_id !== payload.user_id) throw new Error('job owner mismatch')

      const prompt = `You are Verna, an editor for an anonymous emotional poetry platform.

A user wrote this raw thought:
"${draft.raw_text}"

Mood: ${draft.mood || 'unspecified'}
Style: ${draft.style || 'verna'}

Turn it into a poem the user can edit and post.

Rules:
- Keep the emotional truth of the raw thought.
- Do not make it sound like generic AI poetry.
- Use specific language from the user's thought when it matters.
- No cliches like "you are enough", "storms pass", "rise above", "healing journey".
- Keep it postable: 8-32 lines, strong line breaks, no explanation.
- Return ONLY valid JSON:
{
  "title": "<short title or null>",
  "poem": "<the poem text>"
}`

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      })
      const raw = res.content[0].type === 'text' ? res.content[0].text : '{}'

      let parsed: { title?: string | null; poem?: string } = {}
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch (e) {
        parsed = { title: null, poem: raw.trim() }
      }

      if (!parsed.poem?.trim()) throw new Error('empty poem result')

      await supabase
        .from('poem_drafts')
        .update({
          ai_title: parsed.title ?? null,
          ai_poem: parsed.poem,
          edited_title: parsed.title ?? null,
          edited_poem: parsed.poem,
          status: 'ready',
          error_message: null,
        })
        .eq('id', draft.id)
        .eq('user_id', draft.user_id)

      await supabase.rpc('finish_ai_job', { p_id: job.id, p_status: 'completed', p_result: { draft_id: draft.id } })
      return json({ success: true, job: job.id, draft_id: draft.id })

    } else if (job.type === 'transform') {
      const payload = job.payload
      const entryId = payload.entry_id
      const transformType = payload.transform_type

      // Re-fetch entry for current content
      const { data: entry } = await supabase.from('journal_entries').select('*').eq('id', entryId).single()
      if (!entry) throw new Error('entry not found')
      if (payload.user_id && entry.user_id !== payload.user_id) throw new Error('job owner mismatch')

      // Build prompt based on transformType
      let prompt = ''
      if (transformType === 'poem') {
        prompt = `You are a raw, emotional spoken-word poet.\n\nA real person just wrote this journal entry:\n"${entry.content}"\n\nTheir mood: ${entry.mood} (${entry.mood_score}/10)\nTheir journal is called: "${payload.journalTitle || 'My Journal'}"\n\nWrite a spoken-word poem that:\n- Uses their EXACT words and phrases as anchors — lift lines directly from their entry\n- Does NOT rhyme unless it happens naturally\n- Has 4-6 stanzas, each one exploring a different layer of what they felt\n- Reads like Rupi Kaur meets spoken word — short punchy lines, raw, no fluff\n- Never uses clichés like "you are enough", "storms pass", "sun will shine"\n- Captures contradiction if it exists (e.g. pain + relief, anger + love)\n- Ends on something true, not something falsely hopeful\n\nWrite ONLY the poem. No title. No explanation.`
      } else if (transformType === 'story') {
        prompt = `You are a cinematic writer adapting a real person's journal entry into a short story.\n\nJournal entry:\n"${entry.content}"\n\nMood: ${entry.mood} (${entry.mood_score}/10)\nJournal: "${payload.journalTitle || 'My Journal'}"\n\nWrite a 3-4 paragraph cinematic story that:\n- Places the person as the main character (call them "she", "he", or "they" — pick what fits)\n- If they mentioned other people, give those people ACTUAL dialogue based on what was described\n- Uses specific sensory details — what did the room smell like, what was the light doing\n- Does NOT summarize — SHOW the scene happening in real time\n- Has a cinematic quality like a film scene, not a book summary\n- Captures the emotional truth even if it's uncomfortable\n- Never wraps up too neatly — real life doesn't\n\nWrite ONLY the story. No title. No explanation.`
      } else if (transformType === 'video') {
        prompt = `You are a director writing a short film script based on a real person's emotional experience.\n\nJournal entry:\n"${entry.content}"\n\nMood: ${entry.mood} (${entry.mood_score}/10)\n\nWrite a short film script that includes:\n- SCENE: description of the visual setting (lighting, location, time of day)\n- ACTION: what the character is doing when we first see them\n- DIALOGUE: if other people were mentioned in the entry, write their actual lines based on the context\n- VOICEOVER: the character's internal thoughts in their own voice — use words from the actual entry\n- VISUAL PROMPT: one sentence describing the key image for AI video generation\n\nFormat it exactly like this:\n\nSCENE: [setting description]\n\nACTION: [what we see]\n\nVOICEOVER: "[internal monologue]"\n\nDIALOGUE:\n[Character name]: "[line]"\n[Character name]: "[line]"\n\nVISUAL PROMPT: [one sentence for AI image/video generation]\n\nBe specific. Be cinematic. Be human.`
      }

      const res = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
      const raw = res.content[0].type === 'text' ? res.content[0].text : ''

      let content = raw
      let storedType = transformType === 'video' ? 'video-script' : transformType
      if (transformType === 'video') {
        try {
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
          content = JSON.stringify(parsed)
        } catch (e) {
          content = raw
        }
      }

      const { data: transform, error: transformError } = await supabase
        .from('transforms')
        .insert({ entry_id: entryId, user_id: entry.user_id, type: storedType, content })
        .select()
        .single()

      if (transformError || !transform) throw new Error('transform insert failed')

      await supabase.rpc('finish_ai_job', { p_id: job.id, p_status: 'completed', p_result: { transform_id: transform.id } })
      return json({ success: true, job: job.id, transform_id: transform.id })

    } else if (job.type === 'transcribe') {
      const payload = job.payload
      const entryId = payload.entry_id

      const { data: entry } = await supabase.from('journal_entries').select('id, user_id').eq('id', entryId).single()
      if (!entry) throw new Error('entry not found')
      if (payload.user_id && entry.user_id !== payload.user_id) throw new Error('job owner mismatch')

      // Fetch or use provided URL/base64
      let audioBuffer: ArrayBuffer | null = null
      if (payload.voice_note_url) {
        const response = await fetch(payload.voice_note_url)
        if (response.ok) audioBuffer = await response.arrayBuffer()
      }
      if (!audioBuffer && payload.voice_file_base64) {
        const binaryString = atob(payload.voice_file_base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
        audioBuffer = bytes.buffer
      }

      if (!audioBuffer) throw new Error('no audio data')

      if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')

      const formData = new FormData()
      formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'voice.wav')
      formData.append('model', 'whisper-1')
      formData.append('language', 'en')

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: formData })
      const transcriptionData = await whisperResponse.json()
      if (!whisperResponse.ok) throw new Error('whisper failed')

      const transcribedText = transcriptionData.text || ''
      await supabase.from('journal_entries').update({ voice_transcribed_text: transcribedText }).eq('id', entryId).eq('user_id', entry.user_id)
      await supabase.rpc('finish_ai_job', { p_id: job.id, p_status: 'completed', p_result: { transcribed_text: transcribedText } })
      return json({ success: true, job: job.id, transcribed: true })

    } else {
      await supabase.rpc('finish_ai_job', { p_id: job.id, p_status: 'failed', p_result: { error: 'unknown job type' } })
      return json({ error: true, message: 'unknown job type' }, 400)
    }
  } catch (err) {
    console.error('job processing error', err)
    const message = err instanceof Error ? err.message : String(err)
    if (job.type === 'poem_generate' && job.payload?.draft_id) {
      try {
        await supabase
          .from('poem_drafts')
          .update({ status: 'failed', error_message: message })
          .eq('id', job.payload.draft_id)
      } catch (e) {
        console.error('mark poem draft failed error', e)
      }
    }
    try { await supabase.rpc('finish_ai_job', { p_id: job.id, p_status: 'failed', p_result: { error: message } }) } catch (e) { console.error('finish job failed', e) }
    return json({ error: true, message: 'processing failed' }, 500)
  }
})
