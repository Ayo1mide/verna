import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
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
    await rateLimit(supabase, `poem:saves:list:${authUser.id}`, 300, 3600)

    let query = supabase
      .from("poem_post_saves")
      .select("created_at, poem_post_id")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit + 1)

    if (parsed.data.cursor) query = query.lt("created_at", parsed.data.cursor)

    const { data, error } = await query
    if (error) return json({ error: true, message: "Unable to load saved poems" }, 500)

    const savedRows = data ?? []
    const hasMore = savedRows.length > parsed.data.limit
    const rows = hasMore ? savedRows.slice(0, parsed.data.limit) : savedRows
    const ids = rows.map((row: any) => row.poem_post_id)

    const { data: publicPoems, error: poemsError } = ids.length
      ? await supabase
        .from("public_poem_posts")
        .select("id, parent_post_id, author_handle, author_mode, title, content, mood, tags, reaction_counts, total_reactions, reply_count, repost_count, save_count, published_at, created_at")
        .in("id", ids)
      : { data: [], error: null }

    if (poemsError) return json({ error: true, message: "Unable to load saved poems" }, 500)

    const publicById = new Map((publicPoems ?? []).map((poem: any) => [poem.id, poem]))
    const poems = rows
      .map((row: any) => {
        const poem = publicById.get(row.poem_post_id)
        return poem ? { saved_at: row.created_at, ...poem } : null
      })
      .filter(Boolean)
    const nextCursor = hasMore ? rows[rows.length - 1]?.created_at ?? null : null

    return json({ success: true, poems, next_cursor: nextCursor })
  } catch (err) {
    return handleError("list-saved-poems", err)
  }
})
