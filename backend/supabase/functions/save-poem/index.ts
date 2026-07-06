import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  saved: z.boolean().default(true),
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
    await rateLimit(supabase, `poem:save:${authUser.id}`, 120, 3600)

    const { data: existingSave } = await supabase
      .from("poem_post_saves")
      .select("id")
      .eq("poem_post_id", parsed.data.post_id)
      .eq("user_id", authUser.id)
      .single()

    if (!parsed.data.saved) {
      if (existingSave) {
        await supabase.from("poem_post_saves").delete().eq("id", existingSave.id)
        await supabase.rpc("increment_poem_post_counter", {
          p_post_id: parsed.data.post_id,
          p_counter: "save_count",
          p_delta: -1,
        })
      }

      return json({ success: true, saved: false })
    }

    if (existingSave) return json({ success: true, saved: true })

    const { data: post } = await supabase
      .from("poem_posts")
      .select("id")
      .eq("id", parsed.data.post_id)
      .eq("is_visible", true)
      .eq("is_flagged", false)
      .eq("moderation_status", "approved")
      .single()

    if (!post) return json({ error: true, message: "Post not found" }, 404)

    const { error } = await supabase
      .from("poem_post_saves")
      .insert({ poem_post_id: parsed.data.post_id, user_id: authUser.id })

    if (error) return json({ error: true, message: "Unable to save poem" }, 500)

    await supabase.rpc("increment_poem_post_counter", {
      p_post_id: parsed.data.post_id,
      p_counter: "save_count",
      p_delta: 1,
    })

    return json({ success: true, saved: true })
  } catch (err) {
    return handleError("save-poem", err)
  }
})
