import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.21.0"
import { withTimeout } from "./http.ts"

export type ModerationResult = {
  is_safe: boolean
  contains_crisis: boolean
  contains_pii: boolean
  reason: string | null
}

const fallback: ModerationResult = {
  is_safe: false,
  contains_crisis: false,
  contains_pii: false,
  reason: "Moderation failed",
}

export async function moderatePoemContent(content: string): Promise<ModerationResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) return { ...fallback, reason: "Moderation unavailable" }

  const anthropic = new Anthropic({ apiKey })
  const res = await withTimeout(anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 220,
    messages: [{
      role: "user",
      content: `Review this poem before it appears on an anonymous public poetry feed.

Block content that includes direct self-harm instructions, credible immediate crisis intent, harassment, hate, sexual content involving minors, private personal identifying info, or obvious spam.

Return ONLY valid JSON:
{"is_safe":true|false,"contains_crisis":true|false,"contains_pii":true|false,"reason":null|string}

POEM:
${content}`,
    }],
  }), 20000, "Moderation timed out")

  const raw = res.content[0].type === "text" ? res.content[0].text : "{}"
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim())
    return {
      is_safe: parsed.is_safe === true,
      contains_crisis: parsed.contains_crisis === true,
      contains_pii: parsed.contains_pii === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
    }
  } catch (e) {
    return fallback
  }
}
