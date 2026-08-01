import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, HttpError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"
import { fetchWithTimeout } from "../_shared/http.ts"

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
})

function toFormData(values: Record<string, string>) {
  return new URLSearchParams(values)
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function assertAllowedReturnUrl(value: string) {
  const parsed = new URL(value)
  const configured = [
    Deno.env.get("VERNA_FRONTEND_URL"),
    ...(Deno.env.get("VERNA_ALLOWED_REDIRECT_ORIGINS") ?? "").split(","),
  ]
    .map((item) => item?.trim())
    .filter(Boolean)
    .map((item) => new URL(item!).origin)

  if (configured.length > 0 && !configured.includes(parsed.origin)) {
    throw new HttpError(400, "Checkout return URL is not allowed")
  }
}

async function stripeRequest(path: string, body: URLSearchParams, idempotencyKey?: string) {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured")

  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey

  const response = await fetchWithTimeout(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body,
    timeoutMs: 12000,
  })

  const json = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe request failed: ${JSON.stringify(json)}`)
  }
  return json
}

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)
    }

    const { success_url, cancel_url } = parsed.data
    const user_id = authUser.id
    if (parsed.data.user_id && parsed.data.user_id !== user_id) return json({ error: true, message: "Token does not match requested user" }, 403)
    assertAllowedReturnUrl(success_url)
    assertAllowedReturnUrl(cancel_url)

    const priceId = Deno.env.get("STRIPE_PREMIUM_PRICE_ID")
    if (!priceId) {
      return json({ error: true, message: "Server configuration error" }, 500)
    }

    const supabase = serviceClient()
    await rateLimit(supabase, `billing:checkout:${user_id}`, 10, 3600)

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, stripe_customer_id, subscription_tier")
      .eq("id", user_id)
      .single()

    if (profileError || !profile) {
      return json({ error: true, message: "Profile not found" }, 404)
    }

    let stripeCustomerId = profile.stripe_customer_id
    if (!stripeCustomerId) {
      const customer = await stripeRequest("customers", toFormData({
        "metadata[user_id]": user_id,
      }), `verna-customer-${user_id}`)
      stripeCustomerId = customer.id

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user_id)
    }

    const sessionKeyHash = await sha256Hex(`${user_id}:${priceId}:${success_url}:${cancel_url}`)
    const session = await stripeRequest("checkout/sessions", toFormData({
      mode: "subscription",
      customer: stripeCustomerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url,
      cancel_url,
      client_reference_id: user_id,
      "metadata[user_id]": user_id,
      "subscription_data[metadata][user_id]": user_id,
      "allow_promotion_codes": "true",
    }), `verna-checkout-${sessionKeyHash}`)

    return json({
      success: true,
      checkout_url: session.url,
      session_id: session.id,
      pricing: {
        free: {
          entries_per_month: 5,
          poems_per_month: 2,
          scripts_per_month: 5,
          stories_per_month: 0,
          community_feed: true,
        },
        premium: {
          monthly_usd: 4.99,
          unlimited_entries: true,
          unlimited_poems: true,
          unlimited_stories: true,
          unlimited_scripts: true,
        },
      },
    })
  } catch (err: any) {
    return handleError("create-checkout-session", err)
  }
})
