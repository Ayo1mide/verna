import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fetchWithTimeout } from "../_shared/http.ts"

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

function extractUserId(txRef?: string | null): string | null {
  if (!txRef) return null
  const match = txRef.match(/^verna_premium_([0-9a-f-]{36})_\d+$/i)
  return match?.[1] ?? null
}

async function verifyTransaction(transactionId: number | string) {
  const secret = Deno.env.get("FLUTTERWAVE_SECRET_KEY")
  if (!secret) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured")

  const response = await fetchWithTimeout(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
    timeoutMs: 12000,
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`Flutterwave verification failed: ${JSON.stringify(json)}`)
  return json
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function verifyHmacSignature(rawBody: string, signature: string, secretHash: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretHash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  const bytes = new Uint8Array(signed)
  const hex = bytesToHex(bytes)
  const base64 = bytesToBase64(bytes)
  return timingSafeEqual(signature, hex) || timingSafeEqual(signature, base64)
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: true, message: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } })
  }

  const rawBody = await req.text()
  const signature = req.headers.get("verif-hash")
  const hmacSignature = req.headers.get("flutterwave-signature")
  const secretHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET_HASH")
  if (!secretHash) {
    return new Response(JSON.stringify({ error: true, message: "Missing FLUTTERWAVE_WEBHOOK_SECRET_HASH" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }

  let valid = false
  if (hmacSignature) valid = await verifyHmacSignature(rawBody, hmacSignature, secretHash)
  if (!valid && signature) valid = timingSafeEqual(signature, secretHash)

  if (!valid) {
    return new Response(JSON.stringify({ error: true, message: "Invalid webhook signature" }), { status: 401, headers: { "Content-Type": "application/json" } })
  }

  const payload = JSON.parse(rawBody)
  const event = payload?.event as string | undefined
  const data = payload?.data ?? {}

  const transactionId = data?.id
  const txRef = data?.tx_ref as string | undefined
  const userId = extractUserId(txRef) || data?.meta?.user_id || null

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const fallbackEventId = await sha256Hex(rawBody)
  const providerEventId = String(payload?.id ?? data?.id ?? txRef ?? fallbackEventId)
  const { data: existingEvent } = await supabase
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "flutterwave")
    .eq("provider_event_id", providerEventId)
    .single()

  if (existingEvent) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  }

  try {
    if (event === "charge.completed" && transactionId && userId) {
      const verified = await verifyTransaction(transactionId)
      const verifiedData = verified?.data ?? {}
      const status = String(verifiedData?.status ?? "").toLowerCase()
      const currency = String(verifiedData?.currency ?? "")
      const amount = Number(verifiedData?.amount ?? 0)
      const expectedCurrency = Deno.env.get("FLW_PREMIUM_CURRENCY") ?? "USD"
      const expectedAmount = Number(Deno.env.get("FLW_PREMIUM_AMOUNT") ?? "4.99")
      const paid = status === "successful" && currency === expectedCurrency && amount >= expectedAmount

      await supabase
        .from("profiles")
        .update({
          subscription_tier: paid ? "premium" : "free",
          subscription_status: paid ? "active" : "inactive",
          billing_provider: "flutterwave",
          flutterwave_customer_code: verifiedData?.customer?.customer_code ?? null,
          flutterwave_plan_id: verifiedData?.plan ?? null,
          flutterwave_subscription_id: String(verifiedData?.flw_ref ?? transactionId),
          subscription_renewal_at: paid ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null,
        })
        .eq("id", userId)
    }

    if (event === "subscription.cancelled" || event === "subscription.expired") {
      const customerCode = data?.customer?.customer_code ?? null
      const subId = data?.id ? String(data.id) : null
      const updater = supabase
        .from("profiles")
        .update({
          subscription_tier: "free",
          subscription_status: "inactive",
          billing_provider: "flutterwave",
        })

      if (userId) {
        await updater.eq("id", userId)
      } else if (customerCode) {
        await updater.eq("flutterwave_customer_code", customerCode)
      } else if (subId) {
        await updater.eq("flutterwave_subscription_id", subId)
      }
    }

    const { error: eventError } = await supabase
      .from("payment_webhook_events")
      .insert({ provider: "flutterwave", provider_event_id: providerEventId, event_type: event ?? null })

    if (eventError) {
      const message = String(eventError.message || "").toLowerCase()
      if ((eventError as any).code === "23505" || message.includes("duplicate")) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      throw eventError
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (err: any) {
    console.error("flutterwave-webhook error", err)
    return new Response(JSON.stringify({ error: true, message: err.message ?? String(err) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
