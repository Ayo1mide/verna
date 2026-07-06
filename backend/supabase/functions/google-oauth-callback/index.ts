import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  exchangeGoogleCode,
  ensureGoogleUser,
  issueAccessToken,
  parseOAuthState,
  redirectToCallback,
  sanitizeRedirectUrl,
} from "../_shared/google-oauth.ts"
import { optionsResponse, serviceClient } from "../_shared/auth.ts"

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return optionsResponse()
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405 })

    const url = new URL(req.url)
    const error = url.searchParams.get("error")
    const errorDescription = url.searchParams.get("error_description")
    const fallbackRedirect = sanitizeRedirectUrl(null)

    if (error) {
      return redirectToCallback(fallbackRedirect, {
        error_description: errorDescription || error,
      })
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code || !state) {
      return redirectToCallback(fallbackRedirect, {
        error_description: "Missing OAuth code or state",
      })
    }

    let redirectTo = fallbackRedirect
    try {
      redirectTo = await parseOAuthState(state)
    } catch {
      return redirectToCallback(fallbackRedirect, {
        error_description: "Invalid OAuth state",
      })
    }

    const supabase = serviceClient()
    const googleProfile = await exchangeGoogleCode(code)
    const user = await ensureGoogleUser(supabase, googleProfile)
    const accessToken = await issueAccessToken(user)
    const exchangeCode = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: exchangeError } = await supabase
      .from("oauth_callback_exchanges")
      .insert({
        code: exchangeCode,
        provider: "google",
        user_id: user.user_id,
        access_token: accessToken,
        expires_at: expiresAt,
      })

    if (exchangeError) {
      return redirectToCallback(redirectTo, {
        error_description: "OAuth exchange setup failed. Please retry sign-in.",
      })
    }

    return redirectToCallback(redirectTo, {
      exchange_code: exchangeCode,
      provider: "google",
    })
  } catch (err) {
    console.error("google-oauth-callback error", err instanceof Error ? err.message : String(err))
    return redirectToCallback(sanitizeRedirectUrl(null), {
      error_description: "Google sign-in failed. Please retry.",
    })
  }
})
