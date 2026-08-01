import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createListPublicPoemsHandler, normalizeTag } from "./index.ts";

function makeQuery(response: unknown, calls: Array<Record<string, unknown>>) {
  return {
    select(fields: string) {
      calls.push({ method: "select", fields });
      return this;
    },
    limit(value: number) {
      calls.push({ method: "limit", value });
      return this;
    },
    lt(column: string, value: string) {
      calls.push({ method: "lt", column, value });
      return this;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push({ method: "not", column, operator, value });
      return this;
    },
    eq(column: string, value: string) {
      calls.push({ method: "eq", column, value });
      return this;
    },
    contains(column: string, value: string[]) {
      calls.push({ method: "contains", column, value });
      return this;
    },
    order(column: string, options: unknown) {
      calls.push({ method: "order", column, options });
      return this;
    },
    then(
      resolve: (value: unknown) => unknown,
      reject: (reason?: unknown) => unknown,
    ) {
      return Promise.resolve(response).then(resolve, reject);
    },
  };
}

Deno.test("normalizeTag prepares discover tags", () => {
  assertEquals(normalizeTag(" Short Reads! "), "short-reads");
  assertEquals(normalizeTag("Heart Break"), "heart-break");
});

Deno.test("list-public-poems applies mood and tag filters", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const supabase = {
    from(source: string) {
      calls.push({ method: "from", source });
      return makeQuery({
        data: [
          {
            id: "p1",
            created_at: "2026-07-30T10:00:00.000Z",
            tags: ["heartbreak"],
          },
          {
            id: "p2",
            created_at: "2026-07-30T09:00:00.000Z",
            tags: ["heartbreak"],
          },
        ],
        error: null,
      }, calls);
    },
  };

  const handler = createListPublicPoemsHandler({
    serviceClient: () => supabase as any,
    rateLimit: async (_client, key, limit, windowSeconds) => {
      calls.push({ method: "rateLimit", key, limit, windowSeconds });
    },
  });

  const response = await handler(
    new Request("http://local/list-public-poems", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      body: JSON.stringify({
        limit: 1,
        mood: "Heartbreak",
        tag: "Heart Break",
        sort: "top",
      }),
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.poems.length, 1);
  assertEquals(body.next_cursor, "2026-07-30T10:00:00.000Z");
  assertEquals(
    calls.some((call) =>
      call.method === "from" && call.source === "public_poem_feed_items"
    ),
    true,
  );
  assertEquals(
    calls.some((call) =>
      call.method === "eq" && call.column === "mood" &&
      call.value === "Heartbreak"
    ),
    true,
  );
  assertEquals(
    calls.some((call) =>
      call.method === "contains" && call.column === "tags" &&
      JSON.stringify(call.value) === JSON.stringify(["heart-break"])
    ),
    true,
  );
  assertEquals(
    calls.some((call) =>
      call.method === "rateLimit" && call.key === "poem:feed:203.0.113.9"
    ),
    true,
  );
});

Deno.test("list-public-poems rejects non-post requests", async () => {
  const handler = createListPublicPoemsHandler({
    serviceClient: () => ({}) as any,
    rateLimit: async () => {},
  });

  const response = await handler(
    new Request("http://local/list-public-poems", { method: "GET" }),
  );
  assertEquals(response.status, 405);
});
