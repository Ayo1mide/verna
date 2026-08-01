import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, HttpError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"
import { fetchWithTimeout } from "../_shared/http.ts"

const bodySchema = z.object({
  user_id: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  phone_number: z.string().optional(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
})

const FLW_BASE_URL = "https://api.flutterwave.com/v3"

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

function getHeaders() {
  const secret = Deno.env.get("FLUTTERWAVE_SECRET_KEY")
  if (!secret) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured")
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  }
}

async function findOrCreateMonthlyPlan() {
  const planIdFromEnv = Deno.env.get("FLW_PREMIUM_PLAN_ID")
  if (planIdFromEnv) return Number(planIdFromEnv)

  const amount = Number(Deno.env.get("FLW_PREMIUM_AMOUNT") ?? "4.99")
  const currency = Deno.env.get("FLW_PREMIUM_CURRENCY") ?? "USD"
  const name = Deno.env.get("FLW_PREMIUM_PLAN_NAME") ?? "VERNA Premium Monthly"

  const listRes = await fetchWithTimeout(`${FLW_BASE_URL}/payment-plans`, { headers: getHeaders(), timeoutMs: 12000 })
  const listJson = await listRes.json()
  if (listRes.ok && Array.isArray(listJson?.data)) {
    const existing = listJson.data.find((p: any) =>
      Number(p.amount) === amount &&
      p.interval === "monthly" &&
      p.currency === currency &&
      p.name === name
    )
    if (existing?.id) return Number(existing.id)
  }

  const createRes = await fetchWithTimeout(`${FLW_BASE_URL}/payment-plans`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      amount,
      name,
      interval: "monthly",
      currency,
    }),
    timeoutMs: 12000,
  })
  const createJson = await createRes.json()
  if (!createRes.ok || !createJson?.data?.id) {
    throw new Error(`Failed to create Flutterwave plan: ${JSON.stringify(createJson)}`)
  }
  return Number(createJson.data.id)
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

    const { email, name, phone_number, success_url, cancel_url } = parsed.data
    const user_id = authUser.id
    if (parsed.data.user_id && parsed.data.user_id !== user_id) return json({ error: true, message: "Token does not match requested user" }, 403)
    assertAllowedReturnUrl(success_url)
    assertAllowedReturnUrl(cancel_url)

    const supabase = serviceClient()
    await rateLimit(supabase, `billing:flutterwave:${user_id}`, 10, 3600)

    const planId = await findOrCreateMonthlyPlan()
    const txRef = `verna_premium_${user_id}_${Date.now()}`

    const paymentRes = await fetchWithTimeout(`${FLW_BASE_URL}/payments`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        tx_ref: txRef,
        amount: Number(Deno.env.get("FLW_PREMIUM_AMOUNT") ?? "4.99"),
        currency: Deno.env.get("FLW_PREMIUM_CURRENCY") ?? "USD",
        payment_options: "card",
        payment_plan: planId,
        redirect_url: success_url,
        customer: {
          email,
          name,
          phonenumber: phone_number,
        },
        customizations: {
          title: "VERNA Premium",
          description: "Unlock unlimited entries, poems, stories, and scripts.",
        },
        meta: {
          user_id,
          cancel_url,
          provider: "flutterwave",
        },
      }),
      timeoutMs: 12000,
    })
    const paymentJson = await paymentRes.json()
    if (!paymentRes.ok || !paymentJson?.data?.link) {
      throw new Error(`Failed to create Flutterwave payment link: ${JSON.stringify(paymentJson)}`)
    }

    return json({
      success: true,
      checkout_url: paymentJson.data.link,
      tx_ref: txRef,
      plan_id: planId,
      pricing: {
        free: {
          entries_per_month: 5,
          poems_per_month: 2,
          scripts_per_month: 5,
          stories_per_month: 0,
          community_feed: true,
        },
        premium: {
          monthly: `${Deno.env.get("FLW_PREMIUM_AMOUNT") ?? "4.99"} ${Deno.env.get("FLW_PREMIUM_CURRENCY") ?? "USD"}`,
          unlimited_entries: true,
          unlimited_poems: true,
          unlimited_stories: true,
          unlimited_scripts: true,
        },
      },
    })
  } catch (err: any) {
    return handleError("create-flutterwave-payment-link", err)
  }
})
