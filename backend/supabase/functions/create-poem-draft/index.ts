import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.22.2";
import {
  assertPost,
  handleError,
  json,
  rateLimit,
  requireUser,
  serviceClient,
} from "../_shared/auth.ts";

type CreatePoemDraftDeps = {
  requireUser: typeof requireUser;
  serviceClient: typeof serviceClient;
  rateLimit: typeof rateLimit;
};

const bodySchema = z.object({
  raw_text: z.string().min(12).max(6000),
  mood: z.string().max(80).optional(),
  style: z.enum(["verna", "spoken_word", "minimal", "cinematic"]).default(
    "verna",
  ),
  action: z.enum(["save_draft", "polish"]).default("polish"),
});

export function createPoemDraftHandler(deps: CreatePoemDraftDeps) {
  return async (req: Request) => {
    try {
      const early = assertPost(req);
      if (early) return early;
      const authUser = await deps.requireUser(req);

      let body: unknown;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: true, message: "Invalid JSON body" }, 400);
      }

      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) {
        return json({
          error: true,
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }, 400);
      }

      const supabase = deps.serviceClient();
      const user_id = authUser.id;

      await deps.rateLimit(supabase, `poem:draft:${user_id}`, 30, 3600);

      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user_id)
        .single();

      const tier = profile?.subscription_tier ?? "free";
      if (tier === "free") {
        const monthStartIso = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString();
        const { count } = await supabase
          .from("poem_drafts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user_id)
          .gte("created_at", monthStartIso);

        if ((count ?? 0) >= 25) {
          return json({
            error: true,
            code: "FREE_LIMIT_REACHED",
            message:
              "Free plan poem generation limit reached (25/month). Upgrade for unlimited poem drafts.",
            usage: { drafts_this_month: count ?? 0, draft_limit: 25 },
          }, 402);
        }
      }

      const { data: draft, error: draftError } = await supabase
        .from("poem_drafts")
        .insert({
          user_id,
          raw_text: parsed.data.raw_text,
          mood: parsed.data.mood ?? null,
          style: parsed.data.style,
          edited_poem: parsed.data.action === "save_draft"
            ? parsed.data.raw_text
            : null,
          status: parsed.data.action === "save_draft" ? "draft" : "generating",
        })
        .select("id, status, created_at")
        .single();

      if (draftError || !draft) {
        return json(
          { error: true, message: "Unable to create poem draft" },
          500,
        );
      }

      if (parsed.data.action === "save_draft") {
        return json(
          { success: true, draft_id: draft.id, status: "draft" },
          201,
        );
      }

      const { data: job, error: jobError } = await supabase
        .from("ai_jobs")
        .insert({
          type: "poem_generate",
          payload: { draft_id: draft.id, user_id, style: parsed.data.style },
          status: "pending",
        })
        .select("id")
        .single();

      if (jobError || !job) {
        await supabase
          .from("poem_drafts")
          .update({
            status: "failed",
            error_message: "Unable to queue generation",
          })
          .eq("id", draft.id)
          .eq("user_id", user_id);

        return json(
          { error: true, message: "Unable to queue poem generation" },
          500,
        );
      }

      await supabase
        .from("poem_drafts")
        .update({ generation_job_id: job.id })
        .eq("id", draft.id)
        .eq("user_id", user_id);

      return json({
        success: true,
        draft_id: draft.id,
        job_id: job.id,
        status: "generating",
      }, 202);
    } catch (err) {
      return handleError("create-poem-draft", err);
    }
  };
}

export const handler = createPoemDraftHandler({
  requireUser,
  serviceClient,
  rateLimit,
});

if (import.meta.main) {
  serve(handler);
}
