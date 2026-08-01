import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  cursor: z.string().datetime().optional(),
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
    await rateLimit(supabase, `poem:following-feed:${authUser.id}`, 300, 3600)

    const { data: follows, error: followsError } = await supabase
      .from("poem_profile_follows")
      .select("target_user_id")
      .eq("follower_user_id", authUser.id)

    if (followsError) return json({ error: true, message: "Unable to load following feed" }, 500)

    const targetIds = (follows ?? []).map((row: any) => row.target_user_id)
    if (targetIds.length === 0) return json({ success: true, poems: [], next_cursor: null })

    let query = supabase
      .from("poem_posts")
      .select("id, parent_post_id, author_handle, author_mode, title, content, mood, tags, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at")
      .in("user_id", targetIds)
      .eq("author_mode", "verna_id")
      .is("parent_post_id", null)
      .eq("is_visible", true)
      .eq("is_flagged", false)
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit + 1)

    if (parsed.data.cursor) query = query.lt("created_at", parsed.data.cursor)

    const { data, error } = await query
    if (error) return json({ error: true, message: "Unable to load following feed" }, 500)

    const rows = data ?? []
    const hasMore = rows.length > parsed.data.limit
    const poems = hasMore ? rows.slice(0, parsed.data.limit) : rows
    const nextCursor = hasMore ? poems[poems.length - 1]?.created_at ?? null : null

    return json({ success: true, poems, next_cursor: nextCursor })
  } catch (err) {
    return handleError("list-following-feed", err)
  }
})
