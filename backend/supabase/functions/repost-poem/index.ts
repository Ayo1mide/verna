import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  reposted: z.boolean().default(true),
  author_mode: z.enum(["verna_id", "anonymous"]).default("verna_id"),
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
    await rateLimit(supabase, `poem:repost:${authUser.id}`, 120, 3600)

    const { data: post } = await supabase
      .from("poem_posts")
      .select("id")
      .eq("id", parsed.data.post_id)
      .eq("is_visible", true)
      .eq("is_flagged", false)
      .eq("moderation_status", "approved")
      .single()

    if (!post) return json({ error: true, message: "Post not found" }, 404)

    const { data: existing } = await supabase
      .from("poem_post_reposts")
      .select("id")
      .eq("poem_post_id", parsed.data.post_id)
      .eq("user_id", authUser.id)
      .single()

    if (!parsed.data.reposted) {
      if (existing) {
        await supabase.from("poem_post_reposts").delete().eq("id", existing.id)
        await supabase.rpc("increment_poem_post_counter", {
          p_post_id: parsed.data.post_id,
          p_counter: "repost_count",
          p_delta: -1,
        })
      }
      return json({ success: true, reposted: false })
    }

    if (!existing) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("verna_handle")
        .eq("id", authUser.id)
        .single()

      await supabase.from("poem_post_reposts").insert({
        poem_post_id: parsed.data.post_id,
        user_id: authUser.id,
        author_mode: parsed.data.author_mode,
        author_handle: parsed.data.author_mode === "verna_id" ? profile?.verna_handle ?? null : null,
      })
      await supabase.rpc("increment_poem_post_counter", {
        p_post_id: parsed.data.post_id,
        p_counter: "repost_count",
        p_delta: 1,
      })
    }

    return json({ success: true, reposted: true })
  } catch (err) {
    return handleError("repost-poem", err)
  }
})
