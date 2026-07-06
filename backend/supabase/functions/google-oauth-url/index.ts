import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { buildGoogleOAuthUrl, sanitizeRedirectUrl } from "../_shared/google-oauth.ts"
import { corsHeaders, handleError, json, optionsResponse, rateLimit, serviceClient } from "../_shared/auth.ts"

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return optionsResponse()
    if (!["GET", "POST"].includes(req.method)) return json({ error: true, message: "Method not allowed" }, 405)

    const supabase = serviceClient()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    await rateLimit(supabase, `auth:google:url:${ip}`, 30, 60)

    let redirectTo: string | null = null
    if (req.method === "GET") {
      redirectTo = new URL(req.url).searchParams.get("redirect_to")
    } else {
      const body = await req.json().catch(() => ({}))
      redirectTo = typeof body.redirect_to === "string" ? body.redirect_to : null
    }

    const safeRedirect = sanitizeRedirectUrl(redirectTo)
    const url = await buildGoogleOAuthUrl(safeRedirect)
    return new Response(JSON.stringify({ success: true, data: { url } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return handleError("google-oauth-url", err)
  }
})
