import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  draft_id: z.string().uuid(),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    await rateLimit(supabase, `poem:retry:${authUser.id}`, 20, 3600)

    const { data: draft } = await supabase
      .from("poem_drafts")
      .select("id, user_id, status, style")
      .eq("id", parsed.data.draft_id)
      .eq("user_id", authUser.id)
      .single()

    if (!draft) return json({ error: true, message: "Draft not found" }, 404)
    if (draft.status !== "failed" && draft.status !== "ready") {
      return json({ error: true, message: "Draft cannot be retried right now" }, 409)
    }

    const { data: job, error: jobError } = await supabase
      .from("ai_jobs")
      .insert({
        type: "poem_generate",
        payload: { draft_id: draft.id, user_id: authUser.id, style: draft.style },
        status: "pending",
      })
      .select("id")
      .single()

    if (jobError || !job) return json({ error: true, message: "Unable to queue retry" }, 500)

    await supabase
      .from("poem_drafts")
      .update({ status: "generating", generation_job_id: job.id, error_message: null })
      .eq("id", draft.id)
      .eq("user_id", authUser.id)

    return json({ success: true, draft_id: draft.id, job_id: job.id, status: "generating" }, 202)
  } catch (err) {
    return handleError("retry-poem-draft", err)
  }
})
