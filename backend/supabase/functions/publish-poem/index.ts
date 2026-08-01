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
import { moderatePoemContent } from "../_shared/moderation.ts";

type PublishPoemDeps = {
  requireUser: typeof requireUser;
  serviceClient: typeof serviceClient;
  rateLimit: typeof rateLimit;
  moderatePoemContent: typeof moderatePoemContent;
};

const bodySchema = z.object({
  draft_id: z.string().uuid().optional(),
  parent_post_id: z.string().uuid().optional(),
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(10000).optional(),
  mood: z.string().max(80).optional(),
  tags: z.array(z.string().min(1).max(32)).max(8).default([]),
  author_mode: z.enum(["verna_id", "anonymous"]).default("verna_id"),
});

export function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) =>
          tag.trim().toLowerCase().replace(/[^a-z0-9-_\s]/g, "").replace(
            /\s+/g,
            "-",
          )
        )
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

export function createPublishPoemHandler(deps: PublishPoemDeps) {
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
      await deps.rateLimit(supabase, `poem:publish:${user_id}`, 20, 3600);

      const { data: profile } = await supabase
        .from("profiles")
        .select("verna_handle")
        .eq("id", user_id)
        .single();

      if (!profile) {
        return json({ error: true, message: "Profile not found" }, 404);
      }

      let sourceDraft: any = null;
      let parentPost: any = null;

      if (parsed.data.parent_post_id) {
        const { data: parent } = await supabase
          .from("poem_posts")
          .select("id")
          .eq("id", parsed.data.parent_post_id)
          .eq("is_visible", true)
          .eq("is_flagged", false)
          .eq("moderation_status", "approved")
          .single();

        if (!parent) {
          return json({ error: true, message: "Parent poem not found" }, 404);
        }
        parentPost = parent;
      }

      if (parsed.data.draft_id) {
        const { data: draft } = await supabase
          .from("poem_drafts")
          .select(
            "id, ai_title, ai_poem, edited_title, edited_poem, mood, status",
          )
          .eq("id", parsed.data.draft_id)
          .eq("user_id", user_id)
          .single();

        if (!draft) {
          return json({ error: true, message: "Draft not found" }, 404);
        }
        if (!["ready", "draft"].includes(draft.status)) {
          return json(
            { error: true, message: "Draft is not ready to publish" },
            409,
          );
        }

        const { data: existingPost } = await supabase
          .from("poem_posts")
          .select("id")
          .eq("draft_id", draft.id)
          .eq("user_id", user_id)
          .single();

        if (existingPost) {
          return json({
            error: true,
            message: "Draft has already been published",
            post_id: existingPost.id,
          }, 409);
        }
        sourceDraft = draft;
      }

      const content = (parsed.data.content ?? sourceDraft?.edited_poem ??
        sourceDraft?.ai_poem)?.trim();
      const title = (parsed.data.title ?? sourceDraft?.edited_title ??
        sourceDraft?.ai_title ?? null)?.trim() || null;
      const mood = parsed.data.mood ?? sourceDraft?.mood ?? null;
      const tags = normalizeTags(parsed.data.tags ?? []);
      if (!content) {
        return json({ error: true, message: "Poem content is required" }, 400);
      }

      const moderation = await deps.moderatePoemContent(content);
      const isApproved = moderation.is_safe && !moderation.contains_crisis &&
        !moderation.contains_pii;

      const { data: post, error: postError } = await supabase
        .from("poem_posts")
        .insert({
          draft_id: sourceDraft?.id ?? null,
          parent_post_id: parentPost?.id ?? null,
          user_id,
          author_mode: parsed.data.author_mode,
          author_handle: parsed.data.author_mode === "verna_id"
            ? profile.verna_handle
            : null,
          title,
          content,
          mood,
          tags,
          moderation_status: isApproved ? "approved" : "rejected",
          moderation_reason: moderation.reason,
          is_visible: isApproved,
          is_flagged: !isApproved,
          published_at: isApproved ? new Date().toISOString() : null,
        })
        .select(
          "id, parent_post_id, author_mode, author_handle, moderation_status, moderation_reason, is_visible, created_at",
        )
        .single();

      if (postError || !post) {
        return json({ error: true, message: "Unable to publish poem" }, 500);
      }

      if (parentPost?.id && isApproved) {
        await supabase.rpc("increment_poem_post_counter", {
          p_post_id: parentPost.id,
          p_counter: "reply_count",
          p_delta: 1,
        });
      }

      if (sourceDraft?.id) {
        await supabase
          .from("poem_drafts")
          .update({
            status: "posted",
            edited_title: title,
            edited_poem: content,
          })
          .eq("id", sourceDraft.id)
          .eq("user_id", user_id);
      }

      return json({
        success: true,
        post,
        moderation: {
          approved: isApproved,
          contains_crisis: moderation.contains_crisis,
          contains_pii: moderation.contains_pii,
          reason: moderation.reason,
        },
      });
    } catch (err) {
      return handleError("publish-poem", err);
    }
  };
}

export const handler = createPublishPoemHandler({
  requireUser,
  serviceClient,
  rateLimit,
  moderatePoemContent,
});

if (import.meta.main) {
  serve(handler);
}
