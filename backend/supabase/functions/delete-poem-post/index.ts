import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  mode: z.enum(["unpublish", "delete"]).default("unpublish"),
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
    await rateLimit(supabase, `poem:delete:${authUser.id}`, 30, 3600)

    if (parsed.data.mode === "delete") {
      const { error } = await supabase
        .from("poem_posts")
        .delete()
        .eq("id", parsed.data.post_id)
        .eq("user_id", authUser.id)

      if (error) return json({ error: true, message: "Unable to delete post" }, 500)
      return json({ success: true, deleted: true })
    }

    const { data, error } = await supabase
      .from("poem_posts")
      .update({ is_visible: false })
      .eq("id", parsed.data.post_id)
      .eq("user_id", authUser.id)
      .select("id, is_visible")
      .single()

    if (error || !data) return json({ error: true, message: "Post not found" }, 404)
    return json({ success: true, post: data })
  } catch (err) {
    return handleError("delete-poem-post", err)
  }
})
