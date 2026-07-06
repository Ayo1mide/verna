export type VernaJwtPayload = {
  sub: string
  id: string
  email: string | null
  verna_handle?: string | null
  provider?: string
  jti?: string
  iat: number
  exp: number
}

export class JwtError extends Error {
  status = 401
}

function base64UrlEncode(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))
}

function jwtSecret() {
  const secret = Deno.env.get("VERNA_JWT_SECRET")
  if (!secret || secret.length < 32) {
    const err = new JwtError("JWT secret is not configured")
    err.status = 500
    throw err
  }
  return secret
}

export async function signVernaJwt(input: {
  user_id: string
  email: string | null
  verna_handle?: string | null
  provider?: string
  ttlSeconds?: number
}) {
  const now = Math.floor(Date.now() / 1000)
  const payload: VernaJwtPayload = {
    sub: input.user_id,
    id: input.user_id,
    email: input.email,
    verna_handle: input.verna_handle ?? null,
    provider: input.provider ?? "google",
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + (input.ttlSeconds ?? 15 * 60),
  }
  const header = { alg: "HS256", typ: "JWT" }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = base64UrlEncode(await hmac(jwtSecret(), signingInput))
  return `${signingInput}.${signature}`
}

export async function verifyVernaJwt(token: string): Promise<VernaJwtPayload> {
  const parts = token.split(".")
  if (parts.length !== 3) throw new JwtError("Invalid token")

  const signingInput = `${parts[0]}.${parts[1]}`
  const expected = base64UrlEncode(await hmac(jwtSecret(), signingInput))
  if (expected !== parts[2]) throw new JwtError("Invalid token")

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as VernaJwtPayload
  if (!payload.sub || !payload.exp) throw new JwtError("Invalid token")
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new JwtError("Token expired")
  return payload
}

export async function hashToken(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function buildRefreshToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`
}
