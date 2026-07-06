import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  author_handle: z.string().regex(/^verna[0-9]+$/i),
  following: z.boolean().default(true),
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
    await rateLimit(supabase, `poem:follow:${authUser.id}`, 120, 3600)

    const { data: target } = await supabase
      .from("profiles")
      .select("id, verna_handle")
      .ilike("verna_handle", parsed.data.author_handle)
      .single()

    if (!target) return json({ error: true, message: "Profile not found" }, 404)
    if (target.id === authUser.id) return json({ error: true, message: "You cannot follow yourself" }, 400)

    if (!parsed.data.following) {
      await supabase
        .from("poem_profile_follows")
        .delete()
        .eq("follower_user_id", authUser.id)
        .eq("target_user_id", target.id)

      return json({ success: true, following: false, author_handle: target.verna_handle })
    }

    const { error } = await supabase
      .from("poem_profile_follows")
      .insert({ follower_user_id: authUser.id, target_user_id: target.id })

    if (error && !String(error.message).includes("duplicate")) {
      return json({ error: true, message: "Unable to follow profile" }, 500)
    }

    return json({ success: true, following: true, author_handle: target.verna_handle })
  } catch (err) {
    return handleError("follow-profile", err)
  }
})
