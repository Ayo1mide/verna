import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createCompleteOnboardingHandler } from "./complete-onboarding/index.ts";
import { createPoemDraftHandler } from "./create-poem-draft/index.ts";
import { createListPublicPoemsHandler } from "./list-public-poems/index.ts";
import { createListPoemThreadHandler } from "./list-poem-thread/index.ts";
import { createPublishPoemHandler } from "./publish-poem/index.ts";

type Row = Record<string, any>;

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "poet@example.com",
  user_metadata: { verna_handle: "verna7", provider: "google" },
};

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://local/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  const body = await response.json();
  return { status: response.status, body };
}

function publicPost(row: Row) {
  if (
    !row.is_visible || row.is_flagged || row.moderation_status !== "approved"
  ) return null;
  return {
    id: row.id,
    feed_item_id: row.id,
    feed_item_type: "post",
    reposted_by_handle: null,
    repost_author_mode: null,
    reposted_at: null,
    parent_post_id: row.parent_post_id,
    author_handle: row.author_mode === "verna_id" ? row.author_handle : null,
    author_mode: row.author_mode,
    title: row.title,
    content: row.content,
    mood: row.mood,
    tags: row.tags,
    reaction_counts: row.reaction_counts,
    total_reactions: row.total_reactions,
    reply_count: row.reply_count,
    repost_count: row.repost_count,
    save_count: row.save_count,
    published_at: row.published_at,
    created_at: row.created_at,
  };
}

function createMemorySupabase() {
  const db = {
    profiles: [{
      id: user.id,
      verna_handle: "verna7",
      subscription_tier: "free",
      onboarding_completed: false,
      onboarding_goal: null,
      preferred_moods: [],
    }],
    poem_drafts: [] as Row[],
    poem_posts: [] as Row[],
    ai_jobs: [] as Row[],
  };
  const calls: Row[] = [];
  let idCounter = 0;

  function nowIso() {
    idCounter += 1;
    return `2026-07-30T12:${String(idCounter).padStart(2, "0")}:00.000Z`;
  }

  function makeId(prefix: string) {
    const marker = prefix === "post" ? "a" : prefix === "job" ? "b" : "c";
    return `00000000-0000-4000-8${marker}00-${
      String(idCounter).padStart(12, "0")
    }`;
  }

  function rowsFor(table: string) {
    if (table === "public_poem_posts" || table === "public_poem_feed_items") {
      return db.poem_posts.map(publicPost).filter(Boolean) as Row[];
    }
    return (db as any)[table] as Row[];
  }

  function chain(table: string) {
    const state: Row = {
      table,
      filters: [],
      orders: [],
      limit: null,
      op: "select",
      payload: null,
      countOnly: false,
    };
    const api: any = {
      select(_fields: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) state.countOnly = true;
        return api;
      },
      insert(payload: Row) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ type: "eq", column, value });
        return api;
      },
      gte(column: string, value: unknown) {
        state.filters.push({ type: "gte", column, value });
        return api;
      },
      gt(column: string, value: unknown) {
        state.filters.push({ type: "gt", column, value });
        return api;
      },
      lt(column: string, value: unknown) {
        state.filters.push({ type: "lt", column, value });
        return api;
      },
      not(column: string, operator: string, value: unknown) {
        state.filters.push({ type: "not", column, operator, value });
        return api;
      },
      contains(column: string, value: unknown[]) {
        state.filters.push({ type: "contains", column, value });
        return api;
      },
      order(column: string, options: { ascending?: boolean }) {
        state.orders.push({ column, ascending: options.ascending !== false });
        return api;
      },
      limit(value: number) {
        state.limit = value;
        return api;
      },
      single() {
        return execute(true);
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (reason?: unknown) => unknown,
      ) {
        return Promise.resolve(execute(false)).then(resolve, reject);
      },
    };

    function matches(row: Row) {
      return state.filters.every((filter: Row) => {
        if (filter.type === "eq") return row[filter.column] === filter.value;
        if (filter.type === "gte") return row[filter.column] >= filter.value;
        if (filter.type === "gt") return row[filter.column] > filter.value;
        if (filter.type === "lt") return row[filter.column] < filter.value;
        if (filter.type === "not" && filter.operator === "is") {
          return row[filter.column] !== filter.value;
        }
        if (filter.type === "contains") {
          const values = row[filter.column] ?? [];
          return filter.value.every((item: unknown) => values.includes(item));
        }
        return true;
      });
    }

    function applyQuery(rows: Row[]) {
      const filtered = rows.filter(matches);
      for (const order of [...state.orders].reverse()) {
        filtered.sort((a, b) => {
          if (a[order.column] === b[order.column]) return 0;
          const result = a[order.column] > b[order.column] ? 1 : -1;
          return order.ascending ? result : -result;
        });
      }
      return typeof state.limit === "number"
        ? filtered.slice(0, state.limit)
        : filtered;
    }

    function execute(single: boolean) {
      calls.push({ ...state, filters: [...state.filters] });
      const rows = rowsFor(table);

      if (state.op === "insert") {
        const createdAt = nowIso();
        const row = {
          id: makeId(
            table === "poem_posts"
              ? "post"
              : table === "ai_jobs"
              ? "job"
              : "draft",
          ),
          ...state.payload,
          created_at: createdAt,
          updated_at: createdAt,
          reaction_counts: state.payload?.reaction_counts ?? {},
          total_reactions: state.payload?.total_reactions ?? 0,
          reply_count: state.payload?.reply_count ?? 0,
          repost_count: state.payload?.repost_count ?? 0,
          save_count: state.payload?.save_count ?? 0,
        };
        rows.push(row);
        return { data: single ? row : [row], error: null, count: null };
      }

      if (state.op === "update") {
        const matched = applyQuery(rows);
        for (const row of matched) {
          Object.assign(row, state.payload, { updated_at: nowIso() });
        }
        return {
          data: single ? matched[0] ?? null : matched,
          error: null,
          count: null,
        };
      }

      const matched = applyQuery(rows);
      if (state.countOnly) {
        return { data: null, error: null, count: matched.length };
      }
      return {
        data: single ? matched[0] ?? null : matched,
        error: null,
        count: null,
      };
    }

    return api;
  }

  const supabase = {
    from: chain,
    rpc(name: string, args: Row) {
      calls.push({ op: "rpc", name, args });
      if (name === "increment_poem_post_counter") {
        const post = db.poem_posts.find((row) => row.id === args.p_post_id);
        if (post && args.p_counter === "reply_count") {
          post.reply_count += args.p_delta;
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { supabase, db, calls };
}

Deno.test("mock user completes Verna flow from auth to poem reply thread", async () => {
  const memory = createMemorySupabase();
  const deps = {
    requireUser: async () => user,
    serviceClient: () => memory.supabase as any,
    rateLimit: async (
      _client: any,
      key: string,
      limit: number,
      windowSeconds: number,
    ) => {
      memory.calls.push({ op: "rateLimit", key, limit, windowSeconds });
    },
  };

  const onboarding = createCompleteOnboardingHandler(deps);
  const createDraft = createPoemDraftHandler(deps);
  const publishPoem = createPublishPoemHandler({
    ...deps,
    moderatePoemContent: async () => ({
      is_safe: true,
      contains_crisis: false,
      contains_pii: false,
      reason: null,
    }),
  });
  const listFeed = createListPublicPoemsHandler({
    serviceClient: deps.serviceClient,
    rateLimit: deps.rateLimit,
  });
  const listThread = createListPoemThreadHandler({
    serviceClient: deps.serviceClient,
    rateLimit: deps.rateLimit,
  });

  const onboarded = await readJson(
    await onboarding(jsonRequest("complete-onboarding", {
      goal: "express_feelings",
      preferred_moods: ["Heartbreak", "Hope", "Hope"],
    })),
  );
  assertEquals(onboarded.status, 200);
  assertEquals(memory.db.profiles[0].onboarding_completed, true);
  assertEquals(memory.db.profiles[0].preferred_moods, ["heartbreak", "hope"]);

  const draftResult = await readJson(
    await createDraft(jsonRequest("create-poem-draft", {
      raw_text:
        "  I carried a quiet ocean home and did not know where to pour it.  ",
      mood: "Heartbreak",
      action: "save_draft",
    })),
  );
  assertEquals(draftResult.status, 201);
  assertEquals(memory.db.poem_drafts[0].status, "draft");
  assertEquals(memory.db.ai_jobs.length, 0);

  const published = await readJson(
    await publishPoem(jsonRequest("publish-poem", {
      draft_id: draftResult.body.draft_id,
      title: "  Quiet Ocean  ",
      tags: ["Heart Break", "Short Reads", "Heart Break"],
      author_mode: "verna_id",
    })),
  );
  assertEquals(published.status, 200);
  assertEquals(published.body.post.author_handle, "verna7");
  assertEquals(memory.db.poem_posts[0].title, "Quiet Ocean");
  assertEquals(
    memory.db.poem_posts[0].content,
    "I carried a quiet ocean home and did not know where to pour it.",
  );
  assertEquals(memory.db.poem_posts[0].tags, ["heart-break", "short-reads"]);
  assertEquals(memory.db.poem_drafts[0].status, "posted");

  const feed = await readJson(
    await listFeed(jsonRequest("list-public-poems", {
      tag: "Heart Break",
      limit: 10,
    }, { "x-forwarded-for": "203.0.113.10, 10.0.0.2" })),
  );
  assertEquals(feed.status, 200);
  assertEquals(feed.body.poems.length, 1);
  assertEquals(feed.body.poems[0].author_handle, "verna7");

  const reply = await readJson(
    await publishPoem(jsonRequest("publish-poem", {
      parent_post_id: published.body.post.id,
      content: "The sky answered late,\nbut it came carrying your name.",
      mood: "Hope",
      tags: ["Hope"],
      author_mode: "anonymous",
    })),
  );
  assertEquals(reply.status, 200);
  assertEquals(reply.body.post.parent_post_id, published.body.post.id);
  assertEquals(reply.body.post.author_handle, null);
  assertEquals(memory.db.poem_posts[0].reply_count, 1);

  const thread = await readJson(
    await listThread(jsonRequest("list-poem-thread", {
      post_id: published.body.post.id,
    })),
  );
  assertEquals(thread.status, 200);
  assertExists(thread.body.root);
  assertEquals(thread.body.replies.length, 1);
  assertEquals(thread.body.replies[0].author_mode, "anonymous");
  assertEquals(thread.body.root.reply_count, 1);

  assertEquals(
    memory.calls.some((call) =>
      call.op === "rateLimit" && call.key === `poem:draft:${user.id}`
    ),
    true,
  );
  assertEquals(
    memory.calls.some((call) =>
      call.op === "rateLimit" && call.key === `poem:publish:${user.id}`
    ),
    true,
  );
});

Deno.test("unsafe poems are rejected and excluded from public feed", async () => {
  const memory = createMemorySupabase();
  const deps = {
    requireUser: async () => user,
    serviceClient: () => memory.supabase as any,
    rateLimit: async () => {},
  };
  const publishPoem = createPublishPoemHandler({
    ...deps,
    moderatePoemContent: async () => ({
      is_safe: false,
      contains_crisis: true,
      contains_pii: false,
      reason: "Crisis language",
    }),
  });
  const listFeed = createListPublicPoemsHandler({
    serviceClient: deps.serviceClient,
    rateLimit: async () => {},
  });

  const published = await readJson(
    await publishPoem(jsonRequest("publish-poem", {
      content: "This line should be stopped before the feed.",
      mood: "Crisis",
      tags: ["crisis"],
      author_mode: "anonymous",
    })),
  );

  assertEquals(published.status, 200);
  assertEquals(published.body.post.moderation_status, "rejected");
  assertEquals(published.body.post.is_visible, false);
  assertEquals(memory.db.poem_posts[0].is_flagged, true);

  const feed = await readJson(
    await listFeed(jsonRequest("list-public-poems", { limit: 10 })),
  );
  assertEquals(feed.status, 200);
  assertEquals(feed.body.poems.length, 0);
});
