import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  post_id: z.string().uuid(),
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    await rateLimit(supabase, `poem:thread:${ip}`, 240, 3600)

    const selectFields = "id, parent_post_id, author_handle, author_mode, title, content, mood, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at"

    const { data: root } = await supabase
      .from("public_poem_posts")
      .select(selectFields)
      .eq("id", parsed.data.post_id)
      .single()

    if (!root) return json({ error: true, message: "Poem not found" }, 404)

    let repliesQuery = supabase
      .from("public_poem_posts")
      .select(selectFields)
      .eq("parent_post_id", parsed.data.post_id)
      .order("created_at", { ascending: true })
      .limit(parsed.data.limit + 1)

    if (parsed.data.cursor) repliesQuery = repliesQuery.gt("created_at", parsed.data.cursor)

    const { data: replies, error } = await repliesQuery
    if (error) return json({ error: true, message: "Unable to load replies" }, 500)

    const rows = replies ?? []
    const hasMore = rows.length > parsed.data.limit
    const pageReplies = hasMore ? rows.slice(0, parsed.data.limit) : rows
    const nextCursor = hasMore ? pageReplies[pageReplies.length - 1]?.created_at ?? null : null

    return json({ success: true, root, replies: pageReplies, next_cursor: nextCursor })
  } catch (err) {
    return handleError("list-poem-thread", err)
  }
})
