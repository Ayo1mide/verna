import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid().optional(),
  action: z.enum(["approve", "reject", "hide", "list_reported"]).default("list_reported"),
  reason: z.string().max(1000).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    const moderatorSecret = Deno.env.get("MODERATOR_API_SECRET")
    if (!moderatorSecret || req.headers.get("x-moderator-secret") !== moderatorSecret) {
      return json({ error: true, message: "Unauthorized moderator request" }, 401)
    }

    let body: unknown
    try { body = await req.json() } catch (e) { body = {} }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()

    if (parsed.data.action === "list_reported") {
      const { data, error } = await supabase
        .from("poem_post_reports")
        .select("id, reason, details, reviewed, created_at, poem_posts(id, author_mode, author_handle, title, content, moderation_status, moderation_reason, is_visible, is_flagged, created_at)")
        .eq("reviewed", false)
        .order("created_at", { ascending: true })
        .limit(parsed.data.limit)

      if (error) return json({ error: true, message: "Unable to load reports" }, 500)
      return json({ success: true, reports: data ?? [] })
    }

    if (!parsed.data.post_id) return json({ error: true, message: "post_id is required" }, 400)

    const update =
      parsed.data.action === "approve"
        ? { moderation_status: "approved", moderation_reason: parsed.data.reason ?? null, is_visible: true, is_flagged: false, published_at: new Date().toISOString() }
        : parsed.data.action === "reject"
          ? { moderation_status: "rejected", moderation_reason: parsed.data.reason ?? "Rejected by moderator", is_visible: false, is_flagged: true }
          : { moderation_reason: parsed.data.reason ?? "Hidden by moderator", is_visible: false, is_flagged: true }

    const { data: post, error } = await supabase
      .from("poem_posts")
      .update(update)
      .eq("id", parsed.data.post_id)
      .select("id, moderation_status, moderation_reason, is_visible, is_flagged")
      .single()

    if (error || !post) return json({ error: true, message: "Unable to moderate post" }, 500)

    await supabase
      .from("poem_post_reports")
      .update({ reviewed: true })
      .eq("poem_post_id", parsed.data.post_id)

    return json({ success: true, post })
  } catch (err) {
    return handleError("moderate-poem", err)
  }
})
