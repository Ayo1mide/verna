import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  draft_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: unknown
    try { body = await req.json() } catch (e) { body = {} }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    await rateLimit(supabase, `poem:drafts:read:${authUser.id}`, 600, 3600)

    let query = supabase
      .from("poem_drafts")
      .select("id, raw_text, mood, style, ai_title, ai_poem, edited_title, edited_poem, status, generation_job_id, error_message, created_at, updated_at")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })

    if (parsed.data.draft_id) query = query.eq("id", parsed.data.draft_id).limit(1)
    else query = query.limit(parsed.data.limit)

    const { data, error } = await query
    if (error) return json({ error: true, message: "Unable to load drafts" }, 500)

    return json({ success: true, drafts: data ?? [], draft: parsed.data.draft_id ? data?.[0] ?? null : undefined })
  } catch (err) {
    return handleError("get-poem-draft", err)
  }
})
