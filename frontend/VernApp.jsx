import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const DEFAULT_FUNCTIONS_BASE = "https://zzttnblnovsypuxrugei.supabase.co/functions/v1";
const TOKEN_KEY = "verna_access_token";
const REFRESH_KEY = "verna_refresh_token";
const SESSION_KEY = "verna_public_session_id";

const T = {
  bg: "#080b0a",
  panel: "#101412",
  panel2: "#151b18",
  line: "rgba(255,255,255,0.11)",
  text: "#f4f1ea",
  soft: "rgba(244,241,234,0.62)",
  muted: "rgba(244,241,234,0.38)",
  accent: "#b8d8ad",
  accent2: "#86b879",
  red: "#d97878",
  blue: "#8eb6ff",
};

const demoPoems = [
  {
    id: "demo-1",
    author_handle: "verna1",
    author_mode: "verna_id",
    title: "after the noise",
    content: "i stopped asking the room\nto become gentle\n\nand became quiet enough\nto hear myself leave",
    reaction_counts: { felt_this: 41, beautiful: 18, same: 9 },
    total_reactions: 68,
    reply_count: 7,
    repost_count: 12,
    save_count: 29,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "demo-2",
    author_handle: "verna27",
    author_mode: "verna_id",
    title: "receipt",
    content: "the truth arrived late\nbut it brought every receipt\n\ni signed nothing\nand still paid",
    reaction_counts: { beautiful: 32, same: 13, quietly_crying: 6 },
    total_reactions: 51,
    reply_count: 4,
    repost_count: 8,
    save_count: 17,
    created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
  },
  {
    id: "demo-3",
    author_handle: null,
    author_mode: "anonymous",
    title: null,
    content: "some days\nhealing is not a sunrise\n\nit is the hand\nthat does not text back",
    reaction_counts: { felt_this: 25, saved_me: 7 },
    total_reactions: 32,
    reply_count: 2,
    repost_count: 3,
    save_count: 11,
    created_at: new Date(Date.now() - 1000 * 60 * 160).toISOString(),
  },
];

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function buildApi(functionsBase, accessToken) {
  const base = (functionsBase || DEFAULT_FUNCTIONS_BASE).replace(/\/$/, "");

  async function request(path, payload = {}, { auth = false, method = "POST" } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`${base}/${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      throw new Error(data?.message || `Request failed (${res.status})`);
    }
    return data;
  }

  return {
    googleOAuthUrl: (redirectTo) => request("google-oauth-url", { redirect_to: redirectTo }),
    exchangeGoogleCode: (exchangeCode) => request("google-oauth-exchange", { exchange_code: exchangeCode }),
    getMe: () => request("get-me", {}, { auth: true }),
    listPublicPoems: (payload) => request("list-public-poems", payload),
    listFollowingFeed: (payload) => request("list-following-feed", payload, { auth: true }),
    aiEditPoem: (payload) => request("ai-edit-poem", payload, { auth: true }),
    publishPoem: (payload) => request("publish-poem", payload, { auth: true }),
    reactToPoem: (payload) => request("react-to-poem", payload),
    savePoem: (payload) => request("save-poem", payload, { auth: true }),
    repostPoem: (payload) => request("repost-poem", payload, { auth: true }),
    followProfile: (payload) => request("follow-profile", payload, { auth: true }),
    getPublicProfile: (payload) => request("get-public-profile", payload),
    listPoemThread: (payload) => request("list-poem-thread", payload),
  };
}

function Icon({ name, size = 22 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    feed: <><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h10" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6" /></>,
    reply: <><path d="M10 8H5v5" /><path d="M5 13c3-4 7-6 14-4" /></>,
    repost: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    save: <path d="M6 3h12v18l-6-4-6 4z" />,
    heart: <path d="M20.8 4.6c-1.8-1.7-4.6-1.5-6.2.4L12 8l-2.6-3C7.8 3.1 5 2.9 3.2 4.6c-2 1.9-2.1 5-.3 7.1L12 21l9.1-9.3c1.8-2.1 1.7-5.2-.3-7.1z" />,
    back: <><path d="M15 18l-6-6 6-6" /></>,
    spark: <><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /><path d="M19 16l.8 3.2L23 20l-3.2.8L19 24l-.8-3.2L15 20l3.2-.8z" /></>,
    google: <><path d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3" /><path d="M12 22a10 10 0 0 0 6.9-2.5l-3.4-2.6A6.4 6.4 0 0 1 2.5 13" /><path d="M2.5 13A10 10 0 0 1 2.5 11l3.8 2.9" /><path d="M12 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 2.5 11" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Button({ children, onClick, variant = "primary", disabled = false, style = {} }) {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${primary ? T.accent : T.line}`,
        background: primary ? T.accent : "transparent",
        color: primary ? "#08100b" : T.text,
        borderRadius: 8,
        padding: "10px 14px",
        fontWeight: 700,
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Shell({ children, nav, setNav, authed, openComposer }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${T.bg}; }
        button, textarea, input { font: inherit; }
        textarea::placeholder, input::placeholder { color: ${T.muted}; }
      `}</style>
      <main style={{ maxWidth: 620, minHeight: "100vh", margin: "0 auto", borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`, paddingBottom: 72 }}>
        {children}
      </main>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,11,10,0.94)", borderTop: `1px solid ${T.line}`, backdropFilter: "blur(18px)" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", height: 62 }}>
          <NavButton active={nav === "feed"} label="Feed" onClick={() => setNav("feed")} icon="feed" />
          <NavButton active={false} label="Post" onClick={openComposer} icon="plus" />
          <NavButton active={nav === "profile"} label={authed ? "Profile" : "Sign in"} onClick={() => setNav("profile")} icon="user" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        border: "none",
        borderRight: `1px solid ${T.line}`,
        background: active ? "rgba(184,216,173,0.1)" : "transparent",
        color: active ? T.accent : T.soft,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        fontSize: 11,
        letterSpacing: "0.02em",
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function Header({ title, right, back }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(8,11,10,0.88)", backdropFilter: "blur(18px)", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {back}
          <strong style={{ fontSize: 19, letterSpacing: "-0.01em" }}>{title}</strong>
        </div>
        {right}
      </div>
    </header>
  );
}

function FeedScreen({ api, authed, me, onOpenProfile, onOpenThread, onNeedAuth }) {
  const [tab, setTab] = useState("for-you");
  const [sort, setSort] = useState("latest");
  const [poems, setPoems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = tab === "following"
          ? await api.listFollowingFeed({ limit: 30 })
          : await api.listPublicPoems({ limit: 30, sort, feed_type: "feed" });
        if (alive) setPoems(data.poems || []);
      } catch (err) {
        if (alive) {
          setError(String(err.message || err));
          setPoems(tab === "for-you" ? demoPoems : []);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [api, tab, sort]);

  return (
    <>
      <Header
        title="Verna"
        right={<span style={{ color: me?.verna_handle ? T.accent : T.muted, fontWeight: 700 }}>{me?.verna_handle || "poem feed"}</span>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Tab active={tab === "for-you"} onClick={() => setTab("for-you")}>For you</Tab>
        <Tab active={tab === "following"} onClick={() => authed ? setTab("following") : onNeedAuth()}>Following</Tab>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
        <Chip active={sort === "latest"} onClick={() => setSort("latest")}>Latest</Chip>
        <Chip active={sort === "top"} onClick={() => setSort("top")}>Top</Chip>
      </div>
      {error && <Notice tone="warn">{error}. Showing local sample poems.</Notice>}
      {loading ? <Notice>Loading poems...</Notice> : poems.length === 0 ? <EmptyFeed tab={tab} /> : (
        <div>
          {poems.map((poem) => (
            <PoemCard
              key={poem.feed_item_id || poem.id}
              poem={normalizePoem(poem)}
              api={api}
              authed={authed}
              onNeedAuth={onNeedAuth}
              onOpenProfile={onOpenProfile}
              onOpenThread={onOpenThread}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Tab({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ height: 50, border: "none", borderRight: `1px solid ${T.line}`, background: active ? T.panel : "transparent", color: active ? T.text : T.muted, fontWeight: 800, cursor: "pointer" }}>
      {children}
      <div style={{ width: 44, height: 3, background: active ? T.accent : "transparent", margin: "10px auto 0" }} />
    </button>
  );
}

function Chip({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${active ? T.accent : T.line}`, background: active ? "rgba(184,216,173,0.12)" : "transparent", color: active ? T.accent : T.soft, borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
      {children}
    </button>
  );
}

function normalizePoem(poem) {
  return {
    ...poem,
    id: poem.id,
    author_handle: poem.author_handle,
    author_mode: poem.author_mode,
    reposted_by_handle: poem.reposted_by_handle,
    title: poem.title,
    content: poem.content,
    reaction_counts: poem.reaction_counts || {},
    reply_count: Number(poem.reply_count || 0),
    repost_count: Number(poem.repost_count || 0),
    save_count: Number(poem.save_count || 0),
  };
}

function PoemCard({ poem, api, authed, onNeedAuth, onOpenProfile, onOpenThread, compact = false }) {
  const [counts, setCounts] = useState(poem.reaction_counts || {});
  const [saveCount, setSaveCount] = useState(poem.save_count || 0);
  const [repostCount, setRepostCount] = useState(poem.repost_count || 0);
  const [busy, setBusy] = useState("");

  const author = poem.author_mode === "anonymous" || !poem.author_handle ? "anonymous" : poem.author_handle;
  const totalReactions = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);

  async function react(reaction_type) {
    if (poem.id?.startsWith("demo-")) {
      setCounts((prev) => ({ ...prev, [reaction_type]: Number(prev[reaction_type] || 0) + 1 }));
      return;
    }
    try {
      const result = await api.reactToPoem({ post_id: poem.id, reaction_type, session_id: getSessionId() });
      setCounts(result.reaction_counts || counts);
    } catch (err) {
      console.warn(err);
    }
  }

  async function save() {
    if (!authed) return onNeedAuth();
    setBusy("save");
    try {
      if (!poem.id?.startsWith("demo-")) await api.savePoem({ post_id: poem.id, saved: true });
      setSaveCount((n) => n + 1);
    } finally {
      setBusy("");
    }
  }

  async function repost() {
    if (!authed) return onNeedAuth();
    setBusy("repost");
    try {
      if (!poem.id?.startsWith("demo-")) await api.repostPoem({ post_id: poem.id, reposted: true, author_mode: "verna_id" });
      setRepostCount((n) => n + 1);
    } finally {
      setBusy("");
    }
  }

  return (
    <article style={{ borderBottom: `1px solid ${T.line}`, padding: compact ? "14px 16px" : "18px 16px", background: T.bg }}>
      {poem.reposted_by_handle && (
        <div style={{ color: T.muted, fontSize: 12, marginBottom: 10 }}>
          reposted by {poem.reposted_by_handle}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => author !== "anonymous" && onOpenProfile(author)}
          style={{ border: "none", background: "transparent", color: author === "anonymous" ? T.muted : T.accent, padding: 0, cursor: author === "anonymous" ? "default" : "pointer", fontWeight: 800 }}
        >
          {author}
        </button>
        <span style={{ color: T.muted, fontSize: 13 }}>{timeAgo(poem.created_at || poem.published_at)}</span>
      </div>
      {poem.title && <h2 style={{ margin: "0 0 10px", fontSize: 17, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{poem.title}</h2>}
      <button onClick={() => onOpenThread(poem.id)} style={{ border: "none", background: "transparent", color: T.text, textAlign: "left", width: "100%", padding: 0, cursor: "pointer" }}>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.72, fontSize: 18, fontFamily: "Georgia, 'Times New Roman', serif" }}>{poem.content}</div>
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 16, color: T.soft }}>
        <Action onClick={() => onOpenThread(poem.id)} icon="reply" label={poem.reply_count || 0} />
        <Action onClick={repost} icon="repost" label={busy === "repost" ? "..." : repostCount} />
        <Action onClick={() => react("felt_this")} icon="heart" label={totalReactions} />
        <Action onClick={save} icon="save" label={busy === "save" ? "..." : saveCount} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {[
          ["felt_this", "felt this"],
          ["beautiful", "beautiful"],
          ["same", "same"],
          ["saved_me", "saved me"],
          ["quietly_crying", "quiet"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => react(key)} style={{ border: `1px solid ${T.line}`, background: T.panel, color: T.muted, borderRadius: 6, padding: "6px 8px", cursor: "pointer", fontSize: 12 }}>
            {label} {counts[key] ? counts[key] : ""}
          </button>
        ))}
      </div>
    </article>
  );
}

function Action({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "6px 0", fontSize: 13 }}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
}

function Composer({ api, authed, me, onClose, parentPost, onPublished, onNeedAuth }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [raw, setRaw] = useState("");
  const [authorMode, setAuthorMode] = useState("verna_id");
  const [style, setStyle] = useState("verna");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function ai(mode, instruction) {
    if (!authed) return onNeedAuth();
    const text = mode === "generate" ? raw : content;
    if (!text.trim() || text.trim().length < 12) {
      setError(mode === "generate" ? "Write at least 12 characters of raw thought first." : "Write a poem first.");
      return;
    }
    setBusy(instruction);
    setError("");
    try {
      const result = await api.aiEditPoem({ mode, text, title, instruction, style });
      setTitle(result.suggestion?.title || title);
      setContent(result.suggestion?.content || content);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!authed) return onNeedAuth();
    if (!content.trim()) {
      setError("Write or generate a poem before posting.");
      return;
    }
    setBusy("publish");
    setError("");
    try {
      const result = await api.publishPoem({
        parent_post_id: parentPost?.id,
        title: title.trim() || undefined,
        content,
        author_mode: authorMode,
      });
      onPublished?.(result.post);
      onClose();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", zIndex: 50 }}>
      <motion.section initial={{ y: 36 }} animate={{ y: 0 }} exit={{ y: 36 }} style={{ maxWidth: 620, height: "100%", margin: "0 auto", background: T.bg, borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column" }}>
        <Header
          title={parentPost ? "Reply with a poem" : "New poem"}
          back={<button onClick={onClose} style={plainIconButton}><Icon name="back" /></button>}
          right={<Button onClick={publish} disabled={busy === "publish"}>{busy === "publish" ? "Posting" : "Post"}</Button>}
        />
        {!authed && <Notice tone="warn">Sign in with Google to post, save, repost, or follow Verna profiles.</Notice>}
        {parentPost && <div style={{ borderBottom: `1px solid ${T.line}`, padding: 14, color: T.muted, fontSize: 13 }}>Replying to {parentPost.author_handle || "anonymous"}</div>}
        <div style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Chip active={authorMode === "verna_id"} onClick={() => setAuthorMode("verna_id")}>Post as {me?.verna_handle || "Verna ID"}</Chip>
            <Chip active={authorMode === "anonymous"} onClick={() => setAuthorMode("anonymous")}>Post anonymous</Chip>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Raw thought, article fragment, messy feeling, or idea for AI to turn into a poem..."
            style={textareaStyle(120)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => ai("generate", "turn_into_poem")} disabled={!!busy}><Icon name="spark" size={17} /> Turn into poem</Button>
            <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ background: T.panel, color: T.text, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px" }}>
              <option value="verna">Verna</option>
              <option value="minimal">Minimal</option>
              <option value="spoken_word">Spoken word</option>
              <option value="cinematic">Cinematic</option>
            </select>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" style={{ background: T.panel, color: T.text, border: `1px solid ${T.line}`, borderRadius: 8, padding: 12 }} />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your poem here, or use AI above then edit before posting..."
            style={textareaStyle(260, true)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <Chip active={busy === "make_more_poetic"} onClick={() => ai("edit", "make_more_poetic")}>Poetic</Chip>
            <Chip active={busy === "make_shorter"} onClick={() => ai("edit", "make_shorter")}>Shorter</Chip>
            <Chip active={busy === "make_rawer"} onClick={() => ai("edit", "make_rawer")}>Rawer</Chip>
            <Chip active={busy === "improve_rhythm"} onClick={() => ai("edit", "improve_rhythm")}>Rhythm</Chip>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      </motion.section>
    </motion.div>
  );
}

function ThreadScreen({ api, postId, authed, onBack, onOpenProfile, onNeedAuth, openComposer }) {
  const [root, setRoot] = useState(null);
  const [replies, setReplies] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setError("");
      try {
        const data = await api.listPoemThread({ post_id: postId, limit: 30 });
        if (alive) {
          setRoot(data.root);
          setReplies(data.replies || []);
        }
      } catch (err) {
        if (alive) setError(String(err.message || err));
      }
    }
    load();
    return () => { alive = false; };
  }, [api, postId]);

  return (
    <>
      <Header title="Poem thread" back={<button onClick={onBack} style={plainIconButton}><Icon name="back" /></button>} />
      {error && <Notice tone="warn">{error}</Notice>}
      {!root ? <Notice>Loading thread...</Notice> : (
        <>
          <PoemCard poem={root} api={api} authed={authed} onNeedAuth={onNeedAuth} onOpenProfile={onOpenProfile} onOpenThread={() => {}} />
          <div style={{ padding: 14, borderBottom: `1px solid ${T.line}` }}>
            <Button onClick={() => openComposer(root)} style={{ width: "100%" }}><Icon name="reply" size={18} /> Reply with a poem</Button>
          </div>
          {replies.map((poem) => (
            <PoemCard key={poem.id} poem={poem} api={api} authed={authed} onNeedAuth={onNeedAuth} onOpenProfile={onOpenProfile} onOpenThread={() => {}} compact />
          ))}
        </>
      )}
    </>
  );
}

function ProfileScreen({ api, authed, me, onNeedAuth, onOpenProfile }) {
  const [myPoems, setMyPoems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me?.verna_handle) return;
    let alive = true;
    async function load() {
      try {
        const data = await api.getPublicProfile({ author_handle: me.verna_handle, limit: 20 });
        if (alive) setMyPoems(data.poems || []);
      } catch (err) {
        if (alive) setError(String(err.message || err));
      }
    }
    load();
    return () => { alive = false; };
  }, [api, me?.verna_handle]);

  if (!authed) {
    return (
      <>
        <Header title="Sign in" />
        <section style={{ padding: 20, display: "grid", gap: 18 }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "18px 0 0" }}>Claim your anonymous poetic identity.</h1>
          <p style={{ color: T.soft, lineHeight: 1.6, margin: 0 }}>Google verifies you. Verna gives you a public identity like `verna1`, `verna2`, or `verna100`. Your email stays private.</p>
          <Button onClick={onNeedAuth} style={{ width: "100%" }}><Icon name="google" size={18} /> Continue with Google</Button>
        </section>
      </>
    );
  }

  return (
    <>
      <Header title="Profile" right={<span style={{ color: T.accent, fontWeight: 800 }}>{me?.verna_handle}</span>} />
      <section style={{ padding: 18, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ width: 64, height: 64, border: `1px solid ${T.line}`, background: T.panel, display: "grid", placeItems: "center", marginBottom: 14 }}>
          <Icon name="user" size={30} />
        </div>
        <h1 style={{ margin: 0, fontSize: 28 }}>{me?.verna_handle}</h1>
        <p style={{ color: T.soft, lineHeight: 1.6 }}>Your public Verna identity. Post as this handle when you want people to follow your voice, or post anonymous when the poem needs no name.</p>
      </section>
      {error && <Notice tone="warn">{error}</Notice>}
      {myPoems.length === 0 ? <Notice>Your public poems will appear here.</Notice> : myPoems.map((poem) => (
        <PoemCard key={poem.id} poem={poem} api={api} authed onNeedAuth={onNeedAuth} onOpenProfile={onOpenProfile} onOpenThread={() => {}} compact />
      ))}
    </>
  );
}

function PublicProfileScreen({ api, handle, authed, onBack, onNeedAuth }) {
  const [profile, setProfile] = useState(null);
  const [poems, setPoems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api.getPublicProfile({ author_handle: handle, limit: 30 });
        if (alive) {
          setProfile(data.profile);
          setPoems(data.poems || []);
        }
      } catch (err) {
        if (alive) setError(String(err.message || err));
      }
    }
    load();
    return () => { alive = false; };
  }, [api, handle]);

  async function follow() {
    if (!authed) return onNeedAuth();
    setBusy(true);
    try {
      await api.followProfile({ author_handle: handle, following: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title={handle} back={<button onClick={onBack} style={plainIconButton}><Icon name="back" /></button>} right={<Button onClick={follow} disabled={busy}>{busy ? "Following" : "Follow"}</Button>} />
      {error && <Notice tone="warn">{error}</Notice>}
      {profile && (
        <section style={{ padding: 18, borderBottom: `1px solid ${T.line}` }}>
          <h1 style={{ margin: 0, fontSize: 30 }}>{profile.author_handle}</h1>
          <p style={{ color: T.soft }}>{profile.poem_count} public poems - {profile.follower_count} followers</p>
        </section>
      )}
      {poems.map((poem) => (
        <PoemCard key={poem.id} poem={poem} api={api} authed={authed} onNeedAuth={onNeedAuth} onOpenProfile={() => {}} onOpenThread={() => {}} compact />
      ))}
    </>
  );
}

function AuthCallback({ api, onDone }) {
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    async function exchange() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);
      const code = hash.get("exchange_code") || search.get("exchange_code");
      if (!code) {
        setMessage("Missing Google exchange code.");
        return;
      }
      try {
        const result = await api.exchangeGoogleCode(code);
        localStorage.setItem(TOKEN_KEY, result.data.access_token);
        localStorage.setItem(REFRESH_KEY, result.data.refresh_token);
        window.history.replaceState({}, "", "/");
        onDone(result.data.access_token);
      } catch (err) {
        setMessage(String(err.message || err));
      }
    }
    exchange();
  }, [api, onDone]);

  return <Notice>{message}</Notice>;
}

function EmptyFeed({ tab }) {
  return (
    <section style={{ padding: 26, color: T.soft, lineHeight: 1.6 }}>
      <h2 style={{ color: T.text, marginTop: 0 }}>{tab === "following" ? "No followed voices yet" : "No poems yet"}</h2>
      <p>{tab === "following" ? "Follow a Verna profile from the feed and their public poems will collect here." : "Once poems are published, the feed will open here."}</p>
    </section>
  );
}

function Notice({ children, tone = "info" }) {
  return (
    <div style={{ margin: 14, padding: 12, border: `1px solid ${tone === "warn" ? "rgba(217,120,120,0.38)" : T.line}`, background: tone === "warn" ? "rgba(217,120,120,0.08)" : T.panel, color: tone === "warn" ? "#f0b0b0" : T.soft, borderRadius: 8, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function timeAgo(value) {
  if (!value) return "now";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function textareaStyle(minHeight, poem = false) {
  return {
    width: "100%",
    minHeight,
    resize: "vertical",
    border: `1px solid ${T.line}`,
    borderRadius: 8,
    background: T.panel,
    color: T.text,
    padding: 13,
    outline: "none",
    lineHeight: poem ? 1.7 : 1.5,
    fontSize: poem ? 18 : 15,
    fontFamily: poem ? "Georgia, 'Times New Roman', serif" : "inherit",
  };
}

const plainIconButton = {
  border: "none",
  background: "transparent",
  color: T.text,
  cursor: "pointer",
  padding: 4,
  display: "grid",
  placeItems: "center",
};

export default function VernApp() {
  const [functionsBase] = useState(() => localStorage.getItem("verna_functions_base") || import.meta.env?.VITE_VERNA_FUNCTIONS_BASE || DEFAULT_FUNCTIONS_BASE);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [me, setMe] = useState(null);
  const [nav, setNav] = useState("feed");
  const [composer, setComposer] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [profileHandle, setProfileHandle] = useState("");
  const api = useMemo(() => buildApi(functionsBase, accessToken), [functionsBase, accessToken]);
  const authed = !!accessToken;

  useEffect(() => {
    if (location.pathname.includes("/auth/callback")) return;
    if (!accessToken) {
      setMe(null);
      return;
    }
    let alive = true;
    api.getMe()
      .then((data) => alive && setMe(data.profile))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        if (alive) {
          setAccessToken("");
          setMe(null);
        }
      });
    return () => { alive = false; };
  }, [api, accessToken]);

  async function signIn() {
    try {
      localStorage.setItem("verna_functions_base", functionsBase);
      const redirectTo = `${window.location.origin}/auth/callback`;
      const result = await api.googleOAuthUrl(redirectTo);
      window.location.href = result.data.url;
    } catch (err) {
      alert(String(err.message || err));
    }
  }

  function onAuthDone(token) {
    setAccessToken(token);
    setNav("feed");
  }

  function openProfile(handle) {
    setProfileHandle(handle);
    setThreadId(null);
    setNav("public-profile");
  }

  function openThread(id) {
    if (id?.startsWith("demo-")) return;
    setThreadId(id);
    setNav("thread");
  }

  if (location.pathname.includes("/auth/callback")) {
    return <div style={{ minHeight: "100vh", background: T.bg, color: T.text, paddingTop: 20 }}><AuthCallback api={api} onDone={onAuthDone} /></div>;
  }

  let screen = null;
  if (nav === "thread" && threadId) {
    screen = <ThreadScreen api={api} postId={threadId} authed={authed} onBack={() => setNav("feed")} onOpenProfile={openProfile} onNeedAuth={signIn} openComposer={(parentPost) => setComposer({ parentPost })} />;
  } else if (nav === "public-profile" && profileHandle) {
    screen = <PublicProfileScreen api={api} handle={profileHandle} authed={authed} onBack={() => setNav("feed")} onNeedAuth={signIn} />;
  } else if (nav === "profile") {
    screen = <ProfileScreen api={api} authed={authed} me={me} onNeedAuth={signIn} onOpenProfile={openProfile} />;
  } else {
    screen = <FeedScreen api={api} authed={authed} me={me} onNeedAuth={signIn} onOpenProfile={openProfile} onOpenThread={openThread} />;
  }

  return (
    <Shell nav={nav} setNav={setNav} authed={authed} openComposer={() => setComposer({})}>
      <AnimatePresence mode="wait">
        <motion.div key={`${nav}-${threadId || profileHandle}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {screen}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {composer && (
          <Composer
            api={api}
            authed={authed}
            me={me}
            parentPost={composer.parentPost}
            onClose={() => setComposer(null)}
            onNeedAuth={signIn}
            onPublished={() => setNav(composer.parentPost ? "thread" : "feed")}
          />
        )}
      </AnimatePresence>
    </Shell>
  );
}
