import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.21.0"
import { z } from "https://esm.sh/zod@3.22.2"
import { assertPost, handleError, HttpError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

const bodySchema = z.object({
  mode: z.enum(["generate", "edit"]).default("edit"),
  text: z.string().min(12).max(8000),
  title: z.string().max(120).optional(),
  instruction: z.enum([
    "make_more_poetic",
    "make_shorter",
    "make_rawer",
    "make_softer",
    "improve_rhythm",
    "generate_title",
    "turn_into_poem",
  ]).default("make_more_poetic"),
  style: z.enum(["verna", "minimal", "spoken_word", "cinematic"]).default("verna"),
})

function requireApiKey() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new HttpError(500, "AI is not configured")
  return apiKey
}

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    let body: unknown
    try { body = await req.json() } catch (e) { return json({ error: true, message: "Invalid JSON body" }, 400) }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return json({ error: true, message: "Invalid request body", details: parsed.error.flatten() }, 400)

    const supabase = serviceClient()
    await rateLimit(supabase, `poem:ai-edit:${authUser.id}`, 40, 3600)

    const anthropic = new Anthropic({ apiKey: requireApiKey() })
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
      messages: [{
        role: "user",
        content: `You are Verna's inline poetry editor. Help the user prepare a poem before posting.

Rules:
- Preserve the user's emotional intent.
- Do not add private facts, names, phone numbers, emails, addresses, or claims not provided.
- Do not save anything. Return only an editable suggestion.
- If mode is "edit", improve the existing poem.
- If mode is "generate", turn the text into a postable poem.
- Return ONLY valid JSON:
{"title":string|null,"content":string}

Mode: ${parsed.data.mode}
Instruction: ${parsed.data.instruction}
Style: ${parsed.data.style}
Existing title: ${parsed.data.title ?? ""}

TEXT:
${parsed.data.text}`,
      }],
    })

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}"
    let suggestion: { title: string | null; content: string }
    try {
      const parsedJson = JSON.parse(raw.replace(/```json|```/g, "").trim())
      suggestion = {
        title: typeof parsedJson.title === "string" && parsedJson.title.trim() ? parsedJson.title.trim().slice(0, 120) : null,
        content: String(parsedJson.content ?? "").trim(),
      }
    } catch (e) {
      throw new HttpError(502, "AI returned an invalid poem edit")
    }

    if (!suggestion.content) throw new HttpError(502, "AI returned an empty poem edit")

    return json({ success: true, suggestion })
  } catch (err) {
    return handleError("ai-edit-poem", err)
  }
})
