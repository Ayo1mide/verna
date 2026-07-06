import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, getOptionalUser, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  reason: z.enum(["self_harm", "harassment", "hate", "sexual_content", "pii", "spam", "other"]),
  details: z.string().max(1000).optional(),
  session_id: z.string().min(12).max(200).optional(),
})

async function hashSession(sessionId: string, postId: string) {
  const data = new TextEncoder().encode(`${sessionId}:${postId}:report`)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 32)
}

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    const authUser = await getOptionalUser(req)
    const reporterUserId = authUser?.id ?? null
    const sessionHash = parsed.data.session_id ? await hashSession(parsed.data.session_id, parsed.data.post_id) : null

    if (!reporterUserId && !sessionHash) {
      return json({ error: true, message: "session_id is required for anonymous reports" }, 400)
    }

    await rateLimit(supabase, `poem:report:${reporterUserId ?? sessionHash}`, 10, 3600)

    const { data: post } = await supabase
      .from("poem_posts")
      .select("id")
      .eq("id", parsed.data.post_id)
      .eq("is_visible", true)
      .eq("moderation_status", "approved")
      .single()

    if (!post) return json({ error: true, message: "Post not found" }, 404)

    const { error } = await supabase
      .from("poem_post_reports")
      .insert({
        poem_post_id: parsed.data.post_id,
        reporter_user_id: reporterUserId,
        session_hash: sessionHash,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null,
      })

    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) return json({ success: true, already_reported: true })
      return json({ error: true, message: "Unable to submit report" }, 500)
    }
    return json({ success: true })
  } catch (err) {
    return handleError("report-poem", err)
  }
})
