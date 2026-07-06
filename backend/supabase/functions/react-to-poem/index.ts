import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"

const REACTIONS = ["felt_this", "beautiful", "same", "saved_me", "quietly_crying"] as const

const bodySchema = z.object({
  post_id: z.string().uuid(),
  reaction_type: z.enum(REACTIONS),
  session_id: z.string().min(12).max(200),
})

async function hashSession(sessionId: string, postId: string) {
  const data = new TextEncoder().encode(`${sessionId}:${postId}`)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 32)
}

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)
    }

    const supabase = serviceClient()
    const sessionHash = await hashSession(parsed.data.session_id, parsed.data.post_id)

    await rateLimit(supabase, `poem:react:${sessionHash}`, 5, 60)

    const { data: reactionCounts } = await supabase.rpc("add_poem_post_reaction", {
      p_post_id: parsed.data.post_id,
      p_reaction_type: parsed.data.reaction_type,
      p_session_hash: sessionHash,
    })

    return json({ success: true, reaction_counts: reactionCounts })
  } catch (err) {
    return handleError("react-to-poem", err)
  }
})
