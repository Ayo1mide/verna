import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["latest", "top"]).default("latest"),
  feed_type: z.enum(["feed", "replies", "all"]).default("feed"),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    let body: unknown
    try { body = await req.json() } catch (e) { body = {} }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    await rateLimit(supabase, `poem:feed:${ip}`, 240, 3600)

    const source = parsed.data.feed_type === "feed" ? "public_poem_feed_items" : "public_poem_posts"
    const fields = parsed.data.feed_type === "feed"
      ? "id, feed_item_id, feed_item_type, reposted_by_handle, repost_author_mode, reposted_at, parent_post_id, author_handle, author_mode, title, content, mood, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at"
      : "id, parent_post_id, author_handle, author_mode, title, content, mood, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at"

    let query = supabase
      .from(source)
      .select(fields)
      .limit(parsed.data.limit + 1)

    if (parsed.data.cursor) query = query.lt("created_at", parsed.data.cursor)
    if (parsed.data.feed_type === "replies") query = query.not("parent_post_id", "is", null)

    if (parsed.data.sort === "top") {
      query = query.order("total_reactions", { ascending: false }).order("created_at", { ascending: false })
    } else {
      query = query.order("created_at", { ascending: false })
    }

    const { data, error } = await query
    if (error) return json({ error: true, message: "Unable to load poems" }, 500)

    const rows = data ?? []
    const hasMore = rows.length > parsed.data.limit
    const poems = hasMore ? rows.slice(0, parsed.data.limit) : rows
    const nextCursor = hasMore ? poems[poems.length - 1]?.created_at ?? null : null

    return json({ success: true, poems, next_cursor: nextCursor })
  } catch (err) {
    return handleError("list-public-poems", err)
  }
})
