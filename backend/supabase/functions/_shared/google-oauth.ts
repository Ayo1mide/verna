import type { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildRefreshToken, hashToken, signVernaJwt } from "./app-jwt.ts"
import { HttpError } from "./auth.ts"
import { fetchWithTimeout } from "./http.ts"

type SupabaseClient = ReturnType<typeof createClient>

export type GoogleUserInfo = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new HttpError(500, "Server configuration error")
  return value
}

export function frontendUrl() {
  return requireEnv("VERNA_FRONTEND_URL").replace(/\/$/, "")
}

export function sanitizeRedirectUrl(raw: string | null | undefined) {
  const fallback = `${frontendUrl()}/`
  if (!raw) return fallback

  try {
    const parsed = new URL(raw)
    const allowed = (Deno.env.get("VERNA_ALLOWED_REDIRECT_ORIGINS") || frontendUrl())
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)

    if (!["http:", "https:"].includes(parsed.protocol)) return fallback
    if (!allowed.includes(parsed.origin)) return fallback
    return parsed.toString()
  } catch {
    return fallback
  }
}

function buildCallbackUrl(redirectTo: string) {
  return new URL("/auth/callback", redirectTo)
}

export async function signOAuthState(redirectTo: string) {
  return await signVernaJwt({
    user_id: "oauth-state",
    email: null,
    provider: "google_oauth_state",
    ttlSeconds: 10 * 60,
    verna_handle: encodeURIComponent(redirectTo),
  })
}

export async function parseOAuthState(state: string) {
  const { verifyVernaJwt } = await import("./app-jwt.ts")
  const payload = await verifyVernaJwt(state)
  if (payload.sub !== "oauth-state" || payload.provider !== "google_oauth_state") {
    throw new HttpError(401, "Invalid OAuth state")
  }
  return sanitizeRedirectUrl(decodeURIComponent(payload.verna_handle ?? ""))
}

export async function buildGoogleOAuthUrl(redirectTo: string) {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"))
  authUrl.searchParams.set("redirect_uri", requireEnv("GOOGLE_REDIRECT_URI"))
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", Deno.env.get("GOOGLE_OAUTH_SCOPES") || "openid email profile")
  authUrl.searchParams.set("state", await signOAuthState(redirectTo))
  authUrl.searchParams.set("prompt", Deno.env.get("GOOGLE_OAUTH_PROMPT") || "select_account")
  authUrl.searchParams.set("access_type", Deno.env.get("GOOGLE_OAUTH_ACCESS_TYPE") || "offline")
  return authUrl.toString()
}

export function redirectToCallback(redirectTo: string, params: Record<string, string>) {
  const callback = buildCallbackUrl(redirectTo)
  callback.hash = new URLSearchParams(params).toString()
  return Response.redirect(callback.toString(), 302)
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  })

  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    timeoutMs: 10000,
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new HttpError(401, tokenJson.error_description || tokenJson.error || "Google token exchange failed")
  }

  const userRes = await fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    timeoutMs: 10000,
  })
  const userInfo = await userRes.json().catch(() => ({}))
  if (!userRes.ok || !userInfo.sub || !userInfo.email || userInfo.email_verified === false) {
    throw new HttpError(401, "Google account email is not verified")
  }

  return userInfo as GoogleUserInfo
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new HttpError(500, "Unable to look up auth user")
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 100) return null
  }
  return null
}

function allowExistingEmailLinking() {
  return Deno.env.get("GOOGLE_LINK_EXISTING_EMAIL_USERS") === "true"
}

export async function ensureGoogleUser(supabase: SupabaseClient, googleProfile: GoogleUserInfo) {
  const { data: identity } = await supabase
    .from("oauth_identities")
    .select("user_id")
    .eq("provider", "google")
    .eq("provider_subject", googleProfile.sub)
    .single()

  let userId = identity?.user_id as string | undefined

  if (!userId) {
    const existing = allowExistingEmailLinking()
      ? await findAuthUserByEmail(supabase, googleProfile.email)
      : null
    if (existing) {
      userId = existing.id
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: googleProfile.email,
        email_confirm: true,
        user_metadata: {
          provider: "google",
          google_sub: googleProfile.sub,
          display_name: googleProfile.name ?? googleProfile.email,
          avatar_url: googleProfile.picture ?? null,
        },
      })
      if (error) {
        const message = String(error.message || "")
        if (message.toLowerCase().includes("already")) {
          throw new HttpError(409, "A user with this email already exists but is not linked to Google")
        }
        throw new HttpError(500, "Unable to create auth user")
      }
      if (!data.user) throw new HttpError(500, "Unable to create auth user")
      userId = data.user.id
    }

    const { error: identityError } = await supabase
      .from("oauth_identities")
      .insert({
        provider: "google",
        provider_subject: googleProfile.sub,
        user_id: userId,
        email: googleProfile.email,
        display_name: googleProfile.name ?? null,
        avatar_url: googleProfile.picture ?? null,
        last_login_at: new Date().toISOString(),
      })

    if (identityError && !String(identityError.message).includes("duplicate")) {
      throw new HttpError(500, "Unable to link Google account")
    }
  } else {
    await supabase
      .from("oauth_identities")
      .update({
        email: googleProfile.email,
        display_name: googleProfile.name ?? null,
        avatar_url: googleProfile.picture ?? null,
        last_login_at: new Date().toISOString(),
      })
      .eq("provider", "google")
      .eq("provider_subject", googleProfile.sub)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, verna_handle")
    .eq("id", userId)
    .single()

  if (!profile) {
    const { data: assigned, error: assignError } = await supabase.rpc("assign_verna_identity")
    if (assignError || !assigned?.[0]) throw new HttpError(500, "Unable to assign Verna identity")
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      username: assigned[0].verna_handle,
      verna_number: assigned[0].verna_number,
      verna_handle: assigned[0].verna_handle,
      avatar_url: googleProfile.picture ?? null,
    })
    if (profileError) throw new HttpError(500, "Unable to create profile")
  }

  const { data: finalProfile } = await supabase
    .from("profiles")
    .select("id, verna_handle")
    .eq("id", userId)
    .single()

  return {
    user_id: userId,
    email: googleProfile.email,
    verna_handle: finalProfile?.verna_handle ?? null,
  }
}

export async function issueAccessToken(user: { user_id: string; email: string | null; verna_handle?: string | null }) {
  return await signVernaJwt({
    user_id: user.user_id,
    email: user.email,
    verna_handle: user.verna_handle ?? null,
    provider: "google",
  })
}

export async function issueRefreshToken(
  supabase: SupabaseClient,
  userId: string,
  req: Request,
) {
  const refreshToken = buildRefreshToken()
  const tokenHash = await hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from("app_refresh_tokens").insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt,
    device_id: req.headers.get("x-device-id"),
    user_agent: req.headers.get("user-agent"),
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  })

  if (error) throw new HttpError(500, "Unable to issue refresh token")
  return refreshToken
}
