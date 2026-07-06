import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "verna_demo_state_v2";

const theme = {
  bg: "#070908",
  ink: "#f4f1ea",
  soft: "rgba(244,241,234,0.68)",
  muted: "rgba(244,241,234,0.42)",
  faint: "rgba(244,241,234,0.12)",
  panel: "#101411",
  panel2: "#171d19",
  accent: "#b7d7ac",
  accent2: "#8abf7f",
  blue: "#9ebdff",
  red: "#e18b8b",
  gold: "#dcc477",
};

const seedPoems = [
  {
    id: "p1",
    author_handle: "verna1",
    author_mode: "verna_id",
    title: "after the noise",
    content: "i stopped asking the room\nto become gentle\n\nand became quiet enough\nto hear myself leave",
    created_at: minutesAgo(18),
    reaction_counts: { felt_this: 41, beautiful: 18, same: 9 },
    reply_count: 2,
    repost_count: 12,
    save_count: 29,
    parent_post_id: null,
  },
  {
    id: "p2",
    author_handle: "verna27",
    author_mode: "verna_id",
    title: "receipt",
    content: "the truth arrived late\nbut it brought every receipt\n\ni signed nothing\nand still paid",
    created_at: minutesAgo(76),
    reaction_counts: { beautiful: 32, same: 13, quietly_crying: 6 },
    reply_count: 1,
    repost_count: 8,
    save_count: 17,
    parent_post_id: null,
  },
  {
    id: "p3",
    author_handle: "verna9",
    author_mode: "verna_id",
    title: "small weather",
    content: "some days\nhealing is not a sunrise\n\nit is the hand\nthat does not text back",
    created_at: minutesAgo(152),
    reaction_counts: { felt_this: 25, saved_me: 7 },
    reply_count: 0,
    repost_count: 3,
    save_count: 11,
    parent_post_id: null,
  },
  {
    id: "r1",
    author_handle: "verna44",
    author_mode: "verna_id",
    title: null,
    content: "leaving quietly\nis still leaving\n\nand still\nit can save a life",
    created_at: minutesAgo(12),
    reaction_counts: { beautiful: 11, felt_this: 8 },
    reply_count: 0,
    repost_count: 1,
    save_count: 6,
    parent_post_id: "p1",
  },
  {
    id: "r2",
    author_handle: null,
    author_mode: "anonymous",
    title: null,
    content: "i think silence\nhas a door knob\n\nsome mornings\ni finally turn it",
    created_at: minutesAgo(8),
    reaction_counts: { same: 5, quietly_crying: 2 },
    reply_count: 0,
    repost_count: 0,
    save_count: 3,
    parent_post_id: "p1",
  },
  {
    id: "r3",
    author_handle: "verna12",
    author_mode: "verna_id",
    title: null,
    content: "i kept the receipt too\nfolded behind my tongue\n\nproof\nthat i survived the price",
    created_at: minutesAgo(42),
    reaction_counts: { beautiful: 7 },
    reply_count: 0,
    repost_count: 2,
    save_count: 4,
    parent_post_id: "p2",
  },
];

const seedProfiles = {
  verna1: { handle: "verna1", followers: 183, bio: "Writes about leaving gently and choosing herself." },
  verna27: { handle: "verna27", followers: 96, bio: "Short poems, sharp edges, honest endings." },
  verna9: { handle: "verna9", followers: 54, bio: "Weather reports from the inside." },
  verna44: { handle: "verna44", followers: 27, bio: "Replying to poems with smaller lanterns." },
  verna12: { handle: "verna12", followers: 71, bio: "Receipts, rituals, recovery." },
  verna100: { handle: "verna100", followers: 0, bio: "Demo profile. Your browser-only Verna identity." },
};

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function makeInitialState() {
  return {
    authed: false,
    me: { verna_handle: "verna100", joined_at: new Date().toISOString() },
    poems: seedPoems,
    profiles: seedProfiles,
    following: ["verna1", "verna27"],
    saved: ["p1"],
    reposted: ["p2"],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...makeInitialState(), ...JSON.parse(raw) } : makeInitialState();
  } catch {
    return makeInitialState();
  }
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
    back: <path d="M15 18l-6-6 6-6" />,
    spark: <><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /><path d="M19 16l.8 3.2L23 20l-3.2.8L19 24l-.8-3.2L15 20l3.2-.8z" /></>,
    google: <><path d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3" /><path d="M12 22a10 10 0 0 0 6.9-2.5l-3.4-2.6A6.4 6.4 0 0 1 2.5 13" /><path d="M2.5 13A10 10 0 0 1 2.5 11l3.8 2.9" /><path d="M12 5.6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 2.5 11" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function AppButton({ children, onClick, variant = "primary", disabled = false, style = {} }) {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${primary ? theme.accent : theme.faint}`,
        background: primary ? theme.accent : "transparent",
        color: primary ? "#071009" : theme.ink,
        borderRadius: 8,
        padding: "10px 14px",
        fontWeight: 750,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.58 : 1,
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

function Shell({ children, nav, setNav, openComposer, authed }) {
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.ink, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { min-height: 100%; }
        body { margin: 0; background: ${theme.bg}; }
        button, textarea, input, select { font: inherit; }
        button:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; }
        textarea::placeholder, input::placeholder { color: ${theme.muted}; }
      `}</style>
      <main style={{ maxWidth: 720, minHeight: "100vh", margin: "0 auto", borderLeft: `1px solid ${theme.faint}`, borderRight: `1px solid ${theme.faint}`, paddingBottom: 72 }}>
        {children}
      </main>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "rgba(7,9,8,0.94)", borderTop: `1px solid ${theme.faint}`, backdropFilter: "blur(18px)" }}>
        <div style={{ maxWidth: 720, height: 64, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
          <NavButton active={nav === "feed"} label="Feed" icon="feed" onClick={() => setNav("feed")} />
          <NavButton active={false} label="Post" icon="plus" onClick={openComposer} />
          <NavButton active={nav === "profile"} label={authed ? "Profile" : "Sign in"} icon="user" onClick={() => setNav("profile")} />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        border: "none",
        borderRight: `1px solid ${theme.faint}`,
        background: active ? "rgba(183,215,172,0.1)" : "transparent",
        color: active ? theme.accent : theme.soft,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        alignContent: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 720,
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function Header({ title, subtitle, right, back }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(7,9,8,0.9)", backdropFilter: "blur(18px)", borderBottom: `1px solid ${theme.faint}` }}>
      <div style={{ minHeight: 64, padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {back}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 830, letterSpacing: "-0.02em" }}>{title}</div>
            {subtitle && <div style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}

function DemoBanner() {
  return (
    <section style={{ margin: 14, padding: 14, border: `1px solid rgba(183,215,172,0.22)`, background: "linear-gradient(135deg, rgba(183,215,172,0.1), rgba(158,189,255,0.06))", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ color: theme.accent, paddingTop: 1 }}><Icon name="spark" size={18} /></div>
        <div>
          <strong>Portfolio demo mode</strong>
          <p style={{ color: theme.soft, lineHeight: 1.5, margin: "5px 0 0", fontSize: 13 }}>
            This Vercel build works without a deployed backend. Posts, replies, follows, saves, reposts, and AI-style editing run in your browser. The Supabase backend in this repo powers the real production version.
          </p>
        </div>
      </div>
    </section>
  );
}

function FeedScreen({ state, setState, setNav, openProfile, openThread, openComposer }) {
  const [tab, setTab] = useState("for-you");
  const [sort, setSort] = useState("latest");

  const poems = useMemo(() => {
    const rootPoems = state.poems.filter((poem) => !poem.parent_post_id);
    const filtered = tab === "following"
      ? rootPoems.filter((poem) => poem.author_handle && state.following.includes(poem.author_handle))
      : rootPoems;
    return [...filtered].sort((a, b) => {
      if (sort === "top") return engagement(b) - engagement(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [state.poems, state.following, tab, sort]);

  return (
    <>
      <Header
        title="Verna"
        subtitle="Poems, replies, and anonymous creative identity"
        right={<AppButton onClick={openComposer}><Icon name="plus" size={17} /> Poem</AppButton>}
      />
      <DemoBanner />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${theme.faint}`, borderBottom: `1px solid ${theme.faint}` }}>
        <Tab active={tab === "for-you"} onClick={() => setTab("for-you")}>For you</Tab>
        <Tab active={tab === "following"} onClick={() => setTab("following")}>Following</Tab>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", gap: 8, borderBottom: `1px solid ${theme.faint}` }}>
        <Chip active={sort === "latest"} onClick={() => setSort("latest")}>Latest</Chip>
        <Chip active={sort === "top"} onClick={() => setSort("top")}>Top poems</Chip>
      </div>
      {poems.length === 0 ? (
        <EmptyState
          title="Follow a few voices"
          body="Open a Verna profile from the feed and follow it. The following feed will update instantly."
          action={<AppButton onClick={() => setTab("for-you")}>Explore For you</AppButton>}
        />
      ) : (
        poems.map((poem) => (
          <PoemCard
            key={poem.id}
            poem={poem}
            state={state}
            setState={setState}
            openProfile={openProfile}
            openThread={openThread}
          />
        ))
      )}
    </>
  );
}

function PoemCard({ poem, state, setState, openProfile, openThread, compact = false }) {
  const author = poem.author_mode === "anonymous" || !poem.author_handle ? "anonymous" : poem.author_handle;
  const isSaved = state.saved.includes(poem.id);
  const isReposted = state.reposted.includes(poem.id);
  const total = engagement(poem);

  function react(type) {
    updatePoem(setState, poem.id, (draft) => {
      draft.reaction_counts = {
        ...draft.reaction_counts,
        [type]: Number(draft.reaction_counts?.[type] || 0) + 1,
      };
    });
  }

  function save() {
    setState((prev) => {
      const saved = prev.saved.includes(poem.id)
        ? prev.saved.filter((id) => id !== poem.id)
        : [...prev.saved, poem.id];
      return persist({ ...prev, saved });
    });
    updatePoem(setState, poem.id, (draft) => {
      draft.save_count = Math.max(0, Number(draft.save_count || 0) + (isSaved ? -1 : 1));
    });
  }

  function repost() {
    setState((prev) => {
      const reposted = prev.reposted.includes(poem.id)
        ? prev.reposted.filter((id) => id !== poem.id)
        : [...prev.reposted, poem.id];
      return persist({ ...prev, reposted });
    });
    updatePoem(setState, poem.id, (draft) => {
      draft.repost_count = Math.max(0, Number(draft.repost_count || 0) + (isReposted ? -1 : 1));
    });
  }

  return (
    <article style={{ padding: compact ? "14px 18px" : "18px", borderBottom: `1px solid ${theme.faint}`, background: theme.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button
          onClick={() => author !== "anonymous" && openProfile(author)}
          style={{ border: "none", background: "transparent", color: author === "anonymous" ? theme.muted : theme.accent, padding: 0, cursor: author === "anonymous" ? "default" : "pointer", fontWeight: 820 }}
        >
          {author}
        </button>
        <span style={{ color: theme.muted, fontSize: 13 }}>{timeAgo(poem.created_at)}</span>
      </div>
      {poem.title && <h2 style={{ fontSize: compact ? 16 : 18, margin: "0 0 10px", letterSpacing: "-0.01em" }}>{poem.title}</h2>}
      <button onClick={() => openThread(poem.id)} style={{ width: "100%", border: "none", background: "transparent", color: theme.ink, textAlign: "left", padding: 0, cursor: "pointer" }}>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", whiteSpace: "pre-wrap", fontSize: compact ? 17 : 19, lineHeight: 1.7 }}>
          {poem.content}
        </div>
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 16, color: theme.soft }}>
        <Action icon="reply" label={poem.reply_count || 0} onClick={() => openThread(poem.id)} />
        <Action icon="repost" label={poem.repost_count || 0} active={isReposted} onClick={repost} />
        <Action icon="heart" label={total} onClick={() => react("felt_this")} />
        <Action icon="save" label={poem.save_count || 0} active={isSaved} onClick={save} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {[
          ["felt_this", "felt this"],
          ["beautiful", "beautiful"],
          ["same", "same"],
          ["saved_me", "saved me"],
          ["quietly_crying", "quiet"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => react(key)} style={{ border: `1px solid ${theme.faint}`, background: theme.panel, color: theme.soft, borderRadius: 7, padding: "6px 8px", cursor: "pointer", fontSize: 12 }}>
            {label} {poem.reaction_counts?.[key] ? poem.reaction_counts[key] : ""}
          </button>
        ))}
      </div>
    </article>
  );
}

function Action({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ border: "none", background: "transparent", color: active ? theme.accent : "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "7px 0", fontSize: 13, fontWeight: 720 }}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
}

function Composer({ state, setState, parentPost, onClose, onPublished }) {
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [authorMode, setAuthorMode] = useState("verna_id");
  const [style, setStyle] = useState("verna");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function generatePoem(mode) {
    const source = mode === "generate" ? raw : content;
    if (!source.trim() || source.trim().length < 10) {
      setError(mode === "generate" ? "Add a raw thought first." : "Write a poem first.");
      return;
    }
    setBusy(mode);
    setError("");
    window.setTimeout(() => {
      const suggestion = buildPoemSuggestion(source, style, mode);
      setTitle((current) => current || suggestion.title);
      setContent(suggestion.content);
      setBusy("");
    }, 500);
  }

  function publish() {
    if (!content.trim()) {
      setError("Write or generate a poem before posting.");
      return;
    }
    const id = `p-${Date.now()}`;
    const newPoem = {
      id,
      author_handle: authorMode === "verna_id" ? state.me.verna_handle : null,
      author_mode: authorMode,
      title: title.trim() || null,
      content: content.trim(),
      created_at: new Date().toISOString(),
      reaction_counts: {},
      reply_count: 0,
      repost_count: 0,
      save_count: 0,
      parent_post_id: parentPost?.id || null,
    };
    setState((prev) => {
      const poems = [newPoem, ...prev.poems].map((poem) => (
        parentPost?.id && poem.id === parentPost.id
          ? { ...poem, reply_count: Number(poem.reply_count || 0) + 1 }
          : poem
      ));
      return persist({ ...prev, authed: true, poems });
    });
    onPublished(id);
    onClose();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.68)" }}>
      <motion.section initial={{ y: 44 }} animate={{ y: 0 }} exit={{ y: 44 }} style={{ maxWidth: 720, height: "100%", margin: "0 auto", background: theme.bg, borderLeft: `1px solid ${theme.faint}`, borderRight: `1px solid ${theme.faint}`, display: "flex", flexDirection: "column" }}>
        <Header
          title={parentPost ? "Reply with a poem" : "New poem"}
          subtitle={parentPost ? `Replying to ${parentPost.author_handle || "anonymous"}` : "Write directly or use the AI-style editor"}
          back={<IconButton onClick={onClose}><Icon name="back" /></IconButton>}
          right={<AppButton onClick={publish}>Post</AppButton>}
        />
        <div style={{ padding: 18, display: "grid", gap: 13, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Chip active={authorMode === "verna_id"} onClick={() => setAuthorMode("verna_id")}>Post as {state.me.verna_handle}</Chip>
            <Chip active={authorMode === "anonymous"} onClick={() => setAuthorMode("anonymous")}>Post anonymous</Chip>
          </div>
          <textarea value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Paste a raw thought, paragraph, article note, or feeling. Demo AI will turn it into an editable poem." style={textareaStyle(112)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AppButton variant="ghost" onClick={() => generatePoem("generate")} disabled={!!busy}><Icon name="spark" size={17} /> {busy === "generate" ? "Writing..." : "Turn into poem"}</AppButton>
            <select value={style} onChange={(event) => setStyle(event.target.value)} style={selectStyle}>
              <option value="verna">Verna</option>
              <option value="minimal">Minimal</option>
              <option value="spoken">Spoken word</option>
              <option value="cinematic">Cinematic</option>
            </select>
          </div>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" style={inputStyle} />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write your poem here, or generate one above and edit it before posting." style={textareaStyle(250, true)} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            <Chip active={busy === "edit-poetic"} onClick={() => generatePoem("edit-poetic")}>Poetic</Chip>
            <Chip active={busy === "edit-short"} onClick={() => generatePoem("edit-short")}>Shorter</Chip>
            <Chip active={busy === "edit-raw"} onClick={() => generatePoem("edit-raw")}>Rawer</Chip>
            <Chip active={busy === "edit-rhythm"} onClick={() => generatePoem("edit-rhythm")}>Rhythm</Chip>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      </motion.section>
    </motion.div>
  );
}

function ThreadScreen({ state, setState, postId, onBack, openProfile, openComposer }) {
  const root = state.poems.find((poem) => poem.id === postId);
  const replies = state.poems
    .filter((poem) => poem.parent_post_id === postId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (!root) {
    return (
      <>
        <Header title="Poem thread" back={<IconButton onClick={onBack}><Icon name="back" /></IconButton>} />
        <EmptyState title="Poem not found" body="Return to the feed and open another poem." action={<AppButton onClick={onBack}>Back to feed</AppButton>} />
      </>
    );
  }

  return (
    <>
      <Header title="Poem thread" subtitle={`${replies.length} poem replies`} back={<IconButton onClick={onBack}><Icon name="back" /></IconButton>} />
      <PoemCard poem={root} state={state} setState={setState} openProfile={openProfile} openThread={() => {}} />
      <div style={{ padding: 14, borderBottom: `1px solid ${theme.faint}` }}>
        <AppButton onClick={() => openComposer(root)} style={{ width: "100%" }}><Icon name="reply" size={18} /> Reply with a poem</AppButton>
      </div>
      {replies.length === 0 ? <Notice>Be the first to reply with a poem.</Notice> : replies.map((poem) => (
        <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={openProfile} openThread={() => {}} compact />
      ))}
    </>
  );
}

function ProfileScreen({ state, setState, openProfile, openThread }) {
  const myPoems = state.poems.filter((poem) => poem.author_handle === state.me.verna_handle);
  const savedPoems = state.poems.filter((poem) => state.saved.includes(poem.id));

  return (
    <>
      <Header title="Profile" subtitle="Demo identity for this Vercel build" right={<AppButton variant="ghost" onClick={() => setState((prev) => persist({ ...prev, authed: true }))}><Icon name="google" size={17} /> Demo sign in</AppButton>} />
      <ProfileHero profile={{ handle: state.me.verna_handle, followers: 0, bio: "Browser-only demo identity. Real Google auth is available after Supabase deployment." }} following={false} />
      <SectionTitle title="Your public poems" />
      {myPoems.length === 0 ? <Notice>Post a poem and it will appear here immediately.</Notice> : myPoems.map((poem) => (
        <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={openProfile} openThread={openThread} compact />
      ))}
      <SectionTitle title="Saved poems" />
      {savedPoems.length === 0 ? <Notice>Saved poems will collect here.</Notice> : savedPoems.map((poem) => (
        <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={openProfile} openThread={openThread} compact />
      ))}
    </>
  );
}

function PublicProfileScreen({ state, setState, handle, onBack, openThread }) {
  const profile = state.profiles[handle] || { handle, followers: 0, bio: "A public Verna voice." };
  const poems = state.poems.filter((poem) => poem.author_handle === handle && !poem.parent_post_id);
  const isFollowing = state.following.includes(handle);

  function follow() {
    setState((prev) => {
      const following = isFollowing ? prev.following.filter((item) => item !== handle) : [...prev.following, handle];
      const profiles = {
        ...prev.profiles,
        [handle]: {
          ...profile,
          followers: Math.max(0, Number(profile.followers || 0) + (isFollowing ? -1 : 1)),
        },
      };
      return persist({ ...prev, following, profiles });
    });
  }

  return (
    <>
      <Header title={handle} subtitle="Public Verna profile" back={<IconButton onClick={onBack}><Icon name="back" /></IconButton>} right={<AppButton onClick={follow}>{isFollowing ? "Following" : "Follow"}</AppButton>} />
      <ProfileHero profile={profile} following={isFollowing} />
      {poems.length === 0 ? <Notice>No public poems yet.</Notice> : poems.map((poem) => (
        <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={() => {}} openThread={openThread} compact />
      ))}
    </>
  );
}

function ProfileHero({ profile, following }) {
  return (
    <section style={{ padding: 18, borderBottom: `1px solid ${theme.faint}` }}>
      <div style={{ width: 72, height: 72, border: `1px solid ${theme.faint}`, background: theme.panel, display: "grid", placeItems: "center", marginBottom: 14 }}>
        <Icon name="user" size={34} />
      </div>
      <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.03em" }}>{profile.handle}</h1>
      <p style={{ color: theme.soft, lineHeight: 1.55, margin: "8px 0" }}>{profile.bio}</p>
      <div style={{ color: theme.muted, fontSize: 13 }}>{profile.followers} followers {following ? "- followed by you" : ""}</div>
    </section>
  );
}

function Tab({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ height: 52, border: "none", borderRight: `1px solid ${theme.faint}`, background: active ? theme.panel : "transparent", color: active ? theme.ink : theme.muted, cursor: "pointer", fontWeight: 820 }}>
      {children}
      <div style={{ width: 48, height: 3, background: active ? theme.accent : "transparent", margin: "10px auto 0" }} />
    </button>
  );
}

function Chip({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${active ? theme.accent : theme.faint}`, background: active ? "rgba(183,215,172,0.12)" : theme.panel, color: active ? theme.accent : theme.soft, borderRadius: 7, padding: "8px 10px", cursor: "pointer", fontSize: 13, fontWeight: 760 }}>
      {children}
    </button>
  );
}

function IconButton({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ border: "none", background: "transparent", color: theme.ink, cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}>
      {children}
    </button>
  );
}

function Notice({ children, tone = "info" }) {
  return (
    <div style={{ margin: 14, padding: 13, border: `1px solid ${tone === "warn" ? "rgba(225,139,139,0.34)" : theme.faint}`, background: tone === "warn" ? "rgba(225,139,139,0.08)" : theme.panel, color: tone === "warn" ? "#f3b7b7" : theme.soft, borderRadius: 9, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <section style={{ padding: 26, color: theme.soft, lineHeight: 1.6 }}>
      <h2 style={{ color: theme.ink, fontSize: 24, margin: "0 0 8px" }}>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

function SectionTitle({ title }) {
  return <div style={{ padding: "14px 18px 8px", color: theme.muted, fontSize: 12, fontWeight: 820, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${theme.faint}` }}>{title}</div>;
}

function engagement(poem) {
  return Object.values(poem.reaction_counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function updatePoem(setState, poemId, updater) {
  setState((prev) => {
    const poems = prev.poems.map((poem) => {
      if (poem.id !== poemId) return poem;
      const next = { ...poem, reaction_counts: { ...(poem.reaction_counts || {}) } };
      updater(next);
      return next;
    });
    return persist({ ...prev, poems });
  });
}

function persist(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function buildPoemSuggestion(text, style, mode) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  const first = words.slice(0, 5).join(" ").toLowerCase();
  const last = words.slice(-5).join(" ").toLowerCase();
  const title = style === "minimal" ? "small proof" : style === "cinematic" ? "the scene inside" : "what remained";

  if (mode !== "generate") {
    return {
      title,
      content: cleaned
        .split(/[.!?]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join("\n")
        .toLowerCase(),
    };
  }

  return {
    title,
    content: [
      first || "i held the thought",
      "until it softened",
      "",
      "not into an answer",
      "but into a door",
      "",
      last || "and i walked through quietly",
    ].join("\n"),
  };
}

function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const inputStyle = {
  width: "100%",
  border: `1px solid ${theme.faint}`,
  borderRadius: 8,
  background: theme.panel,
  color: theme.ink,
  padding: 13,
};

const selectStyle = {
  border: `1px solid ${theme.faint}`,
  borderRadius: 8,
  background: theme.panel,
  color: theme.ink,
  padding: "10px 12px",
};

function textareaStyle(minHeight, poem = false) {
  return {
    ...inputStyle,
    minHeight,
    resize: "vertical",
    outline: "none",
    lineHeight: poem ? 1.7 : 1.5,
    fontSize: poem ? 18 : 15,
    fontFamily: poem ? "Georgia, 'Times New Roman', serif" : "inherit",
  };
}

export default function VernApp() {
  const [state, setState] = useState(loadState);
  const [nav, setNav] = useState("feed");
  const [threadId, setThreadId] = useState(null);
  const [profileHandle, setProfileHandle] = useState("");
  const [composer, setComposer] = useState(null);

  function openThread(id) {
    setThreadId(id);
    setProfileHandle("");
    setNav("thread");
  }

  function openProfile(handle) {
    setProfileHandle(handle);
    setThreadId(null);
    setNav("public-profile");
  }

  function openComposer(parentPost = null) {
    setState((prev) => persist({ ...prev, authed: true }));
    setComposer({ parentPost });
  }

  let screen;
  if (nav === "thread" && threadId) {
    screen = <ThreadScreen state={state} setState={setState} postId={threadId} onBack={() => setNav("feed")} openProfile={openProfile} openComposer={openComposer} />;
  } else if (nav === "public-profile" && profileHandle) {
    screen = <PublicProfileScreen state={state} setState={setState} handle={profileHandle} onBack={() => setNav("feed")} openThread={openThread} />;
  } else if (nav === "profile") {
    screen = <ProfileScreen state={state} setState={setState} openProfile={openProfile} openThread={openThread} />;
  } else {
    screen = <FeedScreen state={state} setState={setState} setNav={setNav} openProfile={openProfile} openThread={openThread} openComposer={() => openComposer()} />;
  }

  return (
    <Shell nav={nav} setNav={setNav} authed={state.authed} openComposer={() => openComposer()}>
      <AnimatePresence mode="wait">
        <motion.div key={`${nav}-${threadId || profileHandle}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {screen}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {composer && (
          <Composer
            state={state}
            setState={setState}
            parentPost={composer.parentPost}
            onClose={() => setComposer(null)}
            onPublished={(id) => {
              if (composer.parentPost) {
                setThreadId(composer.parentPost.id);
                setNav("thread");
              } else {
                setThreadId(id);
                setNav("thread");
              }
            }}
          />
        )}
      </AnimatePresence>
    </Shell>
  );
}
