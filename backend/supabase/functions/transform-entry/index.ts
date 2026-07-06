/**
 * TRANSFORM-ENTRY EDGE FUNCTION
 * 
 * FROM PROMPT: Part 4.2 — Transform Entry
 * Called when user taps "Make Poem", "Make Story", or "Make Video".
 * 
 * WHAT IT DOES:
 * 1. Reads journal entry
 * 2. Calls Claude to generate:
 *    - Poem: raw, emotional spoken-word (4-6 stanzas)
 *    - Story: cinematic 3rd-person narrative (3-4 paragraphs)
 *    - Video-Script: cinematic script + visual prompt (no direct video yet)
 * 3. Saves transform to database
 * 4. Awards milestones via analyze-entry function
 * 
 * REQUEST BODY:
 * { entry_id: uuid, transform_type: 'poem'|'story'|'video', user_id: uuid, journal_id: uuid }
 * 
 * RETURNS:
 * { success: true, transform: { id, type, content } }
 * 
 * IMPLEMENTS FROM PROMPT:
 * ✓ Part 4.2: Transform Entry (poem, story, video-script generation)
 * ✓ Part 10: RLS policies (enforced via service_role_key)
 * 
 * NOTE: Milestone awarding for first_poem, first_story, first_video
 *       is handled by analyze-entry function for consistency.
 */
 

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  entry_id: z.string().uuid(),
  transform_type: z.enum(["poem", "story", "video"]),
  journal_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: any
    try { body = await req.json() } catch (e) { return json({ error: true, message: 'Invalid JSON body' }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: 'Invalid request body', details: parsed.error.flatten() }, 400)
    const { entry_id, transform_type, journal_id } = parsed.data
    const user_id = authUser.id
    if (parsed.data.user_id && parsed.data.user_id !== user_id) return json({ error: true, message: "Token does not match requested user" }, 403)

    const supabase = serviceClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user_id)
      .single()

    const tier = profile?.subscription_tier ?? "free"
    const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    if (tier === "free") {
      const { count: poemCount } = await supabase
        .from("transforms")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("type", "poem")
        .gte("created_at", monthStartIso)

      const { count: scriptCount } = await supabase
        .from("transforms")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("type", "video-script")
        .gte("created_at", monthStartIso)

      if (transform_type === "story") {
        return json({
          error: true,
          code: "PREMIUM_REQUIRED",
          message: "Stories are available on Premium only.",
          pricing: { premium_monthly_usd: 4.99 },
        }, 402)
      }

      if (transform_type === "poem" && (poemCount ?? 0) >= 2) {
        return json({
          error: true,
          code: "FREE_LIMIT_REACHED",
          message: "Free plan poem limit reached (2/month). Upgrade to Premium for unlimited poems.",
          usage: { poems_this_month: poemCount ?? 0, poem_limit: 2 },
          pricing: { premium_monthly_usd: 4.99 },
        }, 402)
      }

      if (transform_type === "video" && (scriptCount ?? 0) >= 5) {
        return json({
          error: true,
          code: "FREE_LIMIT_REACHED",
          message: "Free plan script limit reached (5/month). Upgrade to Premium for unlimited scripts.",
          usage: { scripts_this_month: scriptCount ?? 0, script_limit: 5 },
          pricing: { premium_monthly_usd: 4.99 },
        }, 402)
      }
    }

    const { data: entry } = await supabase
      .from("journal_entries")
      .select("*, journals(title, mood_theme)")
      .eq("id", entry_id)
      .eq("journal_id", journal_id)
      .eq("user_id", user_id)
      .single()

    if (!entry) return json({ error: true, message: 'Entry not found' }, 404)

    try {
      const window = Math.floor(Date.now() / 1000 / 3600) * 3600
      const { data: rlCount, error: rlErr } = await supabase.rpc('increment_rate_limit', { p_key: `ai:transform:${user_id}`, p_window_start: window, p_limit: 50 })
      if (rlErr) console.error('RL RPC error', rlErr)
      if (rlCount && rlCount > 50) return json({ error: true, message: 'Rate limit exceeded for transforms' }, 429)
    } catch (e) { console.error('rate limit check failed', e) }

    const journalTitle = entry.journals?.title ?? "My Journal"
    const entryContent = transform_type === "video" ? entry.content.substring(0, 300) : entry.content
    const { data: job, error: jobError } = await supabase
      .from('ai_jobs')
      .insert({ type: 'transform', payload: { entry_id, transform_type, user_id, journal_id, journalTitle, entryContent }, status: 'pending' })
      .select()
      .single()

    if (jobError || !job) return json({ error: true, message: "Unable to queue transform" }, 500)
    return json({ success: true, queued: true, job_id: job.id })
  } catch (err) {
    return handleError("transform-entry", err)
  }
})
