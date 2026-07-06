import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cryptoProvider = globalThis.crypto

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function secureEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string): Promise<boolean> {
  const parts = signatureHeader.split(",")
  const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1]
  const signature = parts.find((p) => p.startsWith("v1="))?.split("=")[1]
  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${rawBody}`
  const key = await cryptoProvider.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const digest = await cryptoProvider.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload))
  const expected = new Uint8Array(digest)
  const provided = hexToBytes(signature)
  return secureEqual(expected, provided)
}

async function fetchStripeSubscription(subscriptionId: string) {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured")

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  })

  const json = await response.json()
  if (!response.ok) throw new Error(`Stripe subscription fetch failed: ${JSON.stringify(json)}`)
  return json
}

function toIsoFromUnix(value?: number | null) {
  if (!value || value <= 0) return null
  return new Date(value * 1000).toISOString()
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: true, message: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } })
  }

  const signatureHeader = req.headers.get("stripe-signature")
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")
  if (!signatureHeader || !webhookSecret) {
    return new Response(JSON.stringify({ error: true, message: "Missing Stripe signature or webhook secret" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const rawBody = await req.text()
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret)
  if (!isValid) {
    return new Response(JSON.stringify({ error: true, message: "Invalid webhook signature" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }

  const event = JSON.parse(rawBody)
  const eventType: string = event.type
  const object = event.data?.object ?? {}

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    if (eventType === "checkout.session.completed") {
      const customerId = object.customer as string | undefined
      const subscriptionId = object.subscription as string | undefined
      const userId = (object.client_reference_id || object.metadata?.user_id) as string | undefined

      if (customerId && userId) {
        await supabase
          .from("profiles")
          .update({
            subscription_tier: "premium",
            subscription_status: "active",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId ?? null,
          })
          .eq("id", userId)
      }

      if (customerId && subscriptionId) {
        const subscription = await fetchStripeSubscription(subscriptionId)
        const renewalAt = toIsoFromUnix(subscription.current_period_end)
        const priceId = subscription.items?.data?.[0]?.price?.id ?? null
        await supabase
          .from("profiles")
          .update({
            subscription_tier: "premium",
            subscription_status: subscription.status ?? "active",
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            subscription_renewal_at: renewalAt,
          })
          .eq("stripe_customer_id", customerId)
      }
    }

    if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
      const customerId = object.customer as string | undefined
      if (customerId) {
        const status = object.status as string | undefined
        const isPremium = status === "active" || status === "trialing" || status === "past_due"
        const renewalAt = toIsoFromUnix(object.current_period_end as number | undefined)
        const priceId = object.items?.data?.[0]?.price?.id ?? null

        await supabase
          .from("profiles")
          .update({
            subscription_tier: isPremium ? "premium" : "free",
            subscription_status: status ?? "inactive",
            stripe_subscription_id: object.id ?? null,
            stripe_price_id: priceId,
            subscription_renewal_at: renewalAt,
          })
          .eq("stripe_customer_id", customerId)
      }
    }

    if (eventType === "invoice.payment_failed") {
      const customerId = object.customer as string | undefined
      if (customerId) {
        await supabase
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "past_due",
          })
          .eq("stripe_customer_id", customerId)
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (err: any) {
    console.error("stripe-webhook error", err)
    return new Response(JSON.stringify({ error: true, message: err.message ?? String(err) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
