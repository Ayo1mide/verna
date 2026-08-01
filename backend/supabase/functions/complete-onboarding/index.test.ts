import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createCompleteOnboardingHandler, normalizeMood } from "./index.ts";

Deno.test("normalizeMood prepares onboarding moods for storage", () => {
  assertEquals(normalizeMood(" Heartbreak & Loss "), "heartbreak-loss");
  assertEquals(normalizeMood("In Love"), "in-love");
});

Deno.test("complete-onboarding saves normalized preferences", async () => {
  const calls: Record<string, unknown> = {};
  const supabase = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: unknown) {
          calls.update = payload;
          return this;
        },
        eq(column: string, value: string) {
          calls.eq = { column, value };
          return this;
        },
        select(fields: string) {
          calls.select = fields;
          return this;
        },
        single() {
          return {
            data: {
              id: "user-1",
              verna_handle: "verna1",
              onboarding_completed: true,
              onboarding_goal: "express_feelings",
              preferred_moods: ["heartbreak", "hope"],
            },
            error: null,
          };
        },
      };
    },
  };

  const handler = createCompleteOnboardingHandler({
    requireUser: async () => ({
      id: "user-1",
      email: "u@example.com",
      user_metadata: { verna_handle: "verna1", provider: "google" },
    }),
    serviceClient: () => supabase as any,
    rateLimit: async (_client, key, limit, windowSeconds) => {
      calls.rateLimit = { key, limit, windowSeconds };
    },
  });

  const response = await handler(
    new Request("http://local/complete-onboarding", {
      method: "POST",
      body: JSON.stringify({
        goal: "express_feelings",
        preferred_moods: [" Heartbreak ", "Hope", "Hope"],
      }),
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(calls.table, "profiles");
  assertEquals(calls.rateLimit, {
    key: "profile:onboarding:user-1",
    limit: 20,
    windowSeconds: 3600,
  });
  assertEquals(calls.update, {
    onboarding_completed: true,
    onboarding_goal: "express_feelings",
    preferred_moods: ["heartbreak", "hope"],
  });
});

Deno.test("complete-onboarding rejects invalid goals", async () => {
  const handler = createCompleteOnboardingHandler({
    requireUser: async () => ({
      id: "user-1",
      email: null,
      user_metadata: { verna_handle: "verna1", provider: "google" },
    }),
    serviceClient: () => ({}) as any,
    rateLimit: async () => {},
  });

  const response = await handler(
    new Request("http://local/complete-onboarding", {
      method: "POST",
      body: JSON.stringify({ goal: "bad_goal" }),
    }),
  );

  assertEquals(response.status, 400);
});
