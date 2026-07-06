import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { buildRefreshToken, hashToken } from "../_shared/app-jwt.ts"
import { assertPost, handleError, json, rateLimit, serviceClient } from "../_shared/auth.ts"
import { issueAccessToken } from "../_shared/google-oauth.ts"

const bodySchema = z.object({
  refresh_token: z.string().min(20),
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
    const tokenHash = await hashToken(parsed.data.refresh_token)
    await rateLimit(supabase, `auth:refresh:${tokenHash.substring(0, 16)}`, 10, 60)

    const now = new Date().toISOString()
    const { data: tokenRow } = await supabase
      .from("app_refresh_tokens")
      .select("id, user_id, expires_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gte("expires_at", now)
      .single()

    if (!tokenRow) return json({ error: true, message: "Invalid refresh token" }, 401)

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, verna_handle")
      .eq("id", tokenRow.user_id)
      .single()

    const { data: identity } = await supabase
      .from("oauth_identities")
      .select("email")
      .eq("provider", "google")
      .eq("user_id", tokenRow.user_id)
      .single()

    const accessToken = await issueAccessToken({
      user_id: tokenRow.user_id,
      email: identity?.email ?? null,
      verna_handle: profile?.verna_handle ?? null,
    })

    const nextRefreshToken = buildRefreshToken()
    const nextHash = await hashToken(nextRefreshToken)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from("app_refresh_tokens").update({ revoked_at: now }).eq("id", tokenRow.id)
    const { error: insertError } = await supabase.from("app_refresh_tokens").insert({
      token_hash: nextHash,
      user_id: tokenRow.user_id,
      expires_at: expiresAt,
      device_id: req.headers.get("x-device-id"),
      user_agent: req.headers.get("user-agent"),
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    })

    if (insertError) return json({ error: true, message: "Unable to rotate refresh token" }, 500)

    return json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: nextRefreshToken,
      },
    })
  } catch (err) {
    return handleError("refresh-session", err)
  }
})
