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

type OnboardingDeps = {
  requireUser: typeof requireUser;
  serviceClient: typeof serviceClient;
  rateLimit: typeof rateLimit;
};

const bodySchema = z.object({
  goal: z.enum([
    "love_writing",
    "learn_poetry",
    "enjoy_reading",
    "express_feelings",
    "exploring",
  ]).optional(),
  preferred_moods: z.array(z.string().min(1).max(32)).max(12).default([]),
});

export function normalizeMood(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-_\s]/g, "").replace(
    /\s+/g,
    "-",
  );
}

export function createCompleteOnboardingHandler(deps: OnboardingDeps) {
  return async (req: Request) => {
    try {
      const early = assertPost(req);
      if (early) return early;
      const authUser = await deps.requireUser(req);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) {
        return json({
          error: true,
          message: "Invalid request body",
          details: parsed.error.flatten(),
        }, 400);
      }

      const preferredMoods = Array.from(
        new Set(
          parsed.data.preferred_moods.map(normalizeMood).filter(Boolean),
        ),
      );

      const supabase = deps.serviceClient();
      await deps.rateLimit(
        supabase,
        `profile:onboarding:${authUser.id}`,
        20,
        3600,
      );

      const { data: profile, error } = await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          onboarding_goal: parsed.data.goal ?? null,
          preferred_moods: preferredMoods,
        })
        .eq("id", authUser.id)
        .select(
          "id, verna_handle, onboarding_completed, onboarding_goal, preferred_moods",
        )
        .single();

      if (error || !profile) {
        return json({ error: true, message: "Unable to save onboarding" }, 500);
      }

      return json({ success: true, profile });
    } catch (err) {
      return handleError("complete-onboarding", err);
    }
  };
}

export const handler = createCompleteOnboardingHandler({
  requireUser,
  serviceClient,
  rateLimit,
});

if (import.meta.main) {
  serve(handler);
}
