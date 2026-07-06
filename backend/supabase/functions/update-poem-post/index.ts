import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"
import { moderatePoemContent } from "../_shared/moderation.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1).max(10000).optional(),
  author_mode: z.enum(["verna_id", "anonymous"]).optional(),
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
    await rateLimit(supabase, `poem:update:${authUser.id}`, 60, 3600)

    if (!("title" in parsed.data) && !parsed.data.content && !parsed.data.author_mode) {
      return json({ error: true, message: "No update fields provided" }, 400)
    }

    const { data: post } = await supabase
      .from("poem_posts")
      .select("id, content, user_id")
      .eq("id", parsed.data.post_id)
      .eq("user_id", authUser.id)
      .single()

    if (!post) return json({ error: true, message: "Post not found" }, 404)

    const { data: profile } = await supabase
      .from("profiles")
      .select("verna_handle")
      .eq("id", authUser.id)
      .single()

    const nextContent = parsed.data.content ?? post.content
    const moderation = parsed.data.content ? await moderatePoemContent(nextContent) : null
    const approved = moderation ? moderation.is_safe && !moderation.contains_crisis && !moderation.contains_pii : true

    const updates: Record<string, unknown> = {}
    if ("title" in parsed.data) updates.title = parsed.data.title ?? null
    if (parsed.data.content) {
      updates.content = parsed.data.content
      updates.moderation_status = approved ? "approved" : "rejected"
      updates.moderation_reason = moderation?.reason ?? null
      updates.is_visible = approved
      updates.is_flagged = !approved
      updates.published_at = approved ? new Date().toISOString() : null
    }
    if (parsed.data.author_mode) {
      updates.author_mode = parsed.data.author_mode
      updates.author_handle = parsed.data.author_mode === "verna_id" ? profile?.verna_handle ?? null : null
    }

    const { data: updated, error } = await supabase
      .from("poem_posts")
      .update(updates)
      .eq("id", post.id)
      .eq("user_id", authUser.id)
      .select("id, author_mode, author_handle, moderation_status, moderation_reason, is_visible, updated_at")
      .single()

    if (error || !updated) return json({ error: true, message: "Unable to update post" }, 500)
    return json({ success: true, post: updated })
  } catch (err) {
    return handleError("update-poem-post", err)
  }
})
