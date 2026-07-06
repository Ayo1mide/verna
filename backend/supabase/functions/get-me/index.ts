import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { assertPost, handleError, json, rateLimit, requireUser, serviceClient } from "../_shared/auth.ts"

serve(async (req) => {
  try {
    const early = assertPost(req)
    if (early) return early
    const authUser = await requireUser(req)

    const supabase = serviceClient()
    await rateLimit(supabase, `profile:me:${authUser.id}`, 300, 3600)

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, verna_number, verna_handle, subscription_tier, subscription_status, created_at")
      .eq("id", authUser.id)
      .single()

    if (error || !profile) return json({ error: true, message: "Profile not found" }, 404)
    return json({ success: true, profile })
  } catch (err) {
    return handleError("get-me", err)
  }
})
