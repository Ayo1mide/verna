import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JwtError, verifyVernaJwt } from "./app-jwt.ts"

const corsOrigin = Deno.env.get("VERNA_CORS_ORIGIN") || Deno.env.get("VERNA_FRONTEND_URL") || "*"

export const corsHeaders = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

export function optionsResponse() {
  return new Response("ok", { headers: corsHeaders })
}

export function assertPost(req: Request) {
  if (req.method === "OPTIONS") return optionsResponse()
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed")
  return null
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new HttpError(500, "Server configuration error")
  return value
}

export function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
}

export async function rateLimit(
  supabase: any,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_window_start: window,
    p_limit: limit,
  })

  if (error) {
    console.error("rate limit rpc error", error)
    return
  }

  if (data && data > limit) {
    throw new HttpError(429, "Rate limit exceeded")
  }
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HttpError(401, "Missing bearer token")

  try {
    const payload = await verifyVernaJwt(token)
    return {
      id: payload.sub,
      email: payload.email,
      user_metadata: {
        verna_handle: payload.verna_handle ?? null,
        provider: payload.provider ?? "google",
      },
    }
  } catch (err) {
    if (err instanceof JwtError && err.status === 500) throw new HttpError(500, err.message)
    throw new HttpError(401, "Invalid or expired Verna token")
  }
}

export async function getOptionalUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? ""
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null

  try {
    return await requireUser(req)
  } catch {
    return null
  }
}

export function handleError(context: string, err: unknown) {
  if (err instanceof HttpError) {
    return json({ error: true, message: err.message }, err.status)
  }

  const message = err instanceof Error ? err.message : String(err)
  console.error(`${context} error`, message)
  return json({ error: true, message: "Internal server error" }, 500)
}
