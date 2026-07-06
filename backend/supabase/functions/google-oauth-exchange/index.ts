import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"
import { issueRefreshToken } from "../_shared/google-oauth.ts"

const bodySchema = z.object({
  exchange_code: z.string().uuid(),
})

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early

    let body: unknown
    try { body = await req.json() } catch { return json({ error: true, message: "Invalid JSON body" }, 400) }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    await rateLimit(supabase, `auth:google:exchange:${ip}`, 30, 60)

    const now = new Date().toISOString()
    const { data: rows, error } = await supabase
      .from("oauth_callback_exchanges")
      .update({ used_at: now })
      .eq("code", parsed.data.exchange_code)
      .eq("provider", "google")
      .is("used_at", null)
      .gte("expires_at", now)
      .select("user_id, access_token")
      .limit(1)

    const row = rows?.[0]
    if (error || !row) {
      return json({ error: true, code: "INVALID_EXCHANGE_CODE", message: "Exchange code is invalid or expired" }, 401)
    }

    const refreshToken = await issueRefreshToken(supabase, row.user_id, req)

    return json({
      success: true,
      data: {
        access_token: row.access_token,
        refresh_token: refreshToken,
      },
    })
  } catch (err) {
    return handleError("google-oauth-exchange", err)
  }
})
