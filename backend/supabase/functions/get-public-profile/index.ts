import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  author_handle: z.string().regex(/^verna[0-9]+$/i),
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
    await rateLimit(supabase, `poem:profile:${ip}`, 240, 3600)

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, verna_handle, created_at")
      .ilike("verna_handle", parsed.data.author_handle)
      .single()

    if (!profile) return json({ error: true, message: "Profile not found" }, 404)

    let poemsQuery = supabase
      .from("poem_posts")
      .select("id, parent_post_id, author_handle, author_mode, title, content, mood, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at")
      .eq("user_id", profile.id)
      .eq("author_mode", "verna_id")
      .eq("is_visible", true)
      .eq("is_flagged", false)
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit + 1)

    if (parsed.data.cursor) poemsQuery = poemsQuery.lt("created_at", parsed.data.cursor)

    const [{ count: poemCount }, { count: followerCount }, { data: poems, error: poemsError }] = await Promise.all([
      supabase
        .from("poem_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("author_mode", "verna_id")
        .eq("is_visible", true)
        .eq("is_flagged", false)
        .eq("moderation_status", "approved"),
      supabase
        .from("poem_profile_follows")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", profile.id),
      poemsQuery,
    ])

    if (poemsError) return json({ error: true, message: "Unable to load profile poems" }, 500)

    const rows = poems ?? []
    const hasMore = rows.length > parsed.data.limit
    const publicPoems = hasMore ? rows.slice(0, parsed.data.limit) : rows
    const nextCursor = hasMore ? publicPoems[publicPoems.length - 1]?.created_at ?? null : null

    return json({
      success: true,
      profile: {
        author_handle: profile.verna_handle,
        joined_at: profile.created_at,
        poem_count: poemCount ?? 0,
        follower_count: followerCount ?? 0,
      },
      poems: publicPoems.map(({ user_id, ...poem }: any) => poem),
      next_cursor: nextCursor,
    })
  } catch (err) {
    return handleError("get-public-profile", err)
  }
})
