import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "verna_demo_state_v5";

const moods = ["Heartbreak", "Hope", "Love", "Lonely", "Faith", "Reflection", "Anger", "Peace"];
const seedPoems = [
  {
    id: "p1",
    author_handle: "verna1",
    author_mode: "verna_id",
    title: "after the noise",
    content: "i stopped asking the room\nto become gentle\n\nand became quiet enough\nto hear myself leave",
    mood: "Reflection",
    tags: ["short-reads", "healing"],
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
    mood: "Heartbreak",
    tags: ["heartbreak", "truth"],
    created_at: minutesAgo(76),
    reaction_counts: { beautiful: 32, same: 13, quiet: 6 },
    reply_count: 1,
    repost_count: 8,
    save_count: 17,
    parent_post_id: null,
  },
  {
    id: "p3",
    author_handle: null,
    author_mode: "anonymous",
    title: "small weather",
    content: "some days\nhealing is not a sunrise\n\nit is the hand\nthat does not text back",
    mood: "Hope",
    tags: ["hope", "minimal"],
    created_at: minutesAgo(152),
    reaction_counts: { felt_this: 25, saved_me: 7 },
    reply_count: 0,
    repost_count: 3,
    save_count: 11,
    parent_post_id: null,
  },
  {
    id: "p4",
    author_handle: "verna9",
    author_mode: "verna_id",
    title: "moon practice",
    content: "i am learning\nto be witnessed\nwithout performing\n\nlook at the moon\nstill loved\nwhile changing shape",
    mood: "Peace",
    tags: ["moon", "growth"],
    created_at: minutesAgo(244),
    reaction_counts: { beautiful: 39, felt_this: 11 },
    reply_count: 0,
    repost_count: 9,
    save_count: 24,
    parent_post_id: null,
  },
  {
    id: "r1",
    author_handle: "verna44",
    author_mode: "verna_id",
    title: null,
    content: "leaving quietly\nis still leaving\n\nand still\nit can save a life",
    mood: "Reflection",
    tags: ["reply"],
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
    mood: "Hope",
    tags: ["reply", "hope"],
    created_at: minutesAgo(8),
    reaction_counts: { same: 5, quiet: 2 },
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
    mood: "Heartbreak",
    tags: ["reply"],
    created_at: minutesAgo(42),
    reaction_counts: { beautiful: 7 },
    reply_count: 0,
    repost_count: 2,
    save_count: 4,
    parent_post_id: "p2",
  },
];

const seedProfiles = {
  verna1: { handle: "verna1", followers: 183, poems: 42, bio: "Writes about leaving gently and choosing herself.", mood: "Reflection" },
  verna27: { handle: "verna27", followers: 96, poems: 18, bio: "Short poems, sharp edges, honest endings.", mood: "Heartbreak" },
  verna9: { handle: "verna9", followers: 54, poems: 31, bio: "Weather reports from the inside.", mood: "Peace" },
  verna44: { handle: "verna44", followers: 27, poems: 9, bio: "Replying to poems with smaller lanterns.", mood: "Hope" },
  verna12: { handle: "verna12", followers: 71, poems: 22, bio: "Receipts, rituals, recovery.", mood: "Heartbreak" },
  verna100: { handle: "verna100", followers: 0, poems: 0, bio: "New Verna voice. Still choosing the first line.", mood: "Hope" },
};

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function makeInitialState() {
  return {
    authed: false,
    onboardingComplete: false,
    me: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "poet@example.com",
      username: "verna100",
      verna_handle: "verna100",
      subscription_tier: "free",
      subscription_status: "inactive",
      onboarding_goal: "express_feelings",
      joined_at: new Date().toISOString(),
    },
    poems: seedPoems,
    profiles: seedProfiles,
    following: ["verna1", "verna27"],
    saved: ["p1"],
    reposted: ["p2"],
    drafts: [],
    preferredMoods: ["Heartbreak", "Hope"],
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

function persist(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function Icon({ name, size = 21 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    logo: <><path d="M12 3c-4 3-6 6.2-6 9.4A6 6 0 0 0 18 12.4C18 9.2 16 6 12 3Z" /><path d="M12 7v10" /><path d="M9 12h6" /></>,
    feed: <><path d="M4 6h16" /><path d="M4 12h13" /><path d="M4 18h10" /></>,
    write: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6" /></>,
    reply: <><path d="M10 8H5v5" /><path d="M5 13c3-4 7-6 14-4" /></>,
    repost: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    save: <path d="M6 3h12v18l-6-4-6 4z" />,
    heart: <path d="M20.8 4.6c-1.8-1.7-4.6-1.5-6.2.4L12 8l-2.6-3C7.8 3.1 5 2.9 3.2 4.6c-2 1.9-2.1 5-.3 7.1L12 21l9.1-9.3c1.8-2.1 1.7-5.2-.3-7.1z" />,
    back: <path d="M15 18l-6-6 6-6" />,
    spark: <><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /><path d="M19 16l.8 3.2L23 20l-3.2.8L19 24l-.8-3.2L15 20l3.2-.8z" /></>,
    close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function AppButton({ children, onClick, variant = "primary", disabled = false, className = "", type = "button" }) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function AppShell({ children, nav, setNav, openComposer }) {
  const isFeed = nav === "feed" || nav === "thread" || nav === "public-profile";
  return (
    <div className="app-shell">
      <Style />
      <main className="phone-frame">{children}</main>
      <nav className="bottom-nav">
        <NavItem active={isFeed} icon="feed" label="Feed" onClick={() => setNav("feed")} />
        <button className="compose-fab" onClick={() => openComposer()} aria-label="Write">
          <Icon name="write" size={23} />
          <span>Write</span>
        </button>
        <NavItem active={nav === "profile"} icon="user" label="Profile" onClick={() => setNav("profile")} />
      </nav>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function Header({ eyebrow, title, subtitle, right, back }) {
  return (
    <header className="topbar">
      <div className="topbar-main">
        {back}
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}

function FeedScreen({ state, setState, openProfile, openThread, openComposer }) {
  const [tab, setTab] = useState("for-you");
  const [mood, setMood] = useState("All");
  const rootPoems = useMemo(() => {
    const root = state.poems.filter((poem) => !poem.parent_post_id);
    const byTab = tab === "following"
      ? root.filter((poem) => poem.author_handle && state.following.includes(poem.author_handle))
      : tab === "trending"
      ? [...root].sort((a, b) => scorePoem(b) - scorePoem(a))
      : root;
    const byMood = mood === "All" ? byTab : byTab.filter((poem) => poem.mood === mood || poem.tags?.includes(mood.toLowerCase()));
    return [...byMood].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [state.poems, state.following, tab, mood]);

  return (
    <>
      <Header
        eyebrow="Verna feed"
        title="Feed"
        subtitle="Read, save, repost, or answer with a poem."
        right={<button className="icon-button" onClick={openComposer}><Icon name="write" /></button>}
      />
      <div className="tab-row three">
        <button className={tab === "for-you" ? "active" : ""} onClick={() => setTab("for-you")}>For you</button>
        <button className={tab === "following" ? "active" : ""} onClick={() => setTab("following")}>Following</button>
        <button className={tab === "trending" ? "active" : ""} onClick={() => setTab("trending")}>Trending</button>
      </div>
      <HorizontalChips values={["All", ...moods]} active={mood} setActive={setMood} />
      <section className="feed-list">
        {rootPoems.map((poem) => (
          <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={openProfile} openThread={openThread} />
        ))}
      </section>
    </>
  );
}

function PoemCard({ poem, state, setState, openProfile, openThread, compact = false }) {
  const author = poem.author_mode === "anonymous" || !poem.author_handle ? "anonymous" : poem.author_handle;
  const total = scorePoem(poem);
  const saved = state.saved.includes(poem.id);
  const reposted = state.reposted.includes(poem.id);

  function react(type) {
    updatePoem(setState, poem.id, (draft) => {
      draft.reaction_counts = { ...draft.reaction_counts, [type]: Number(draft.reaction_counts?.[type] || 0) + 1 };
    });
  }
  function save() {
    setState((prev) => persist({ ...prev, saved: saved ? prev.saved.filter((id) => id !== poem.id) : [...prev.saved, poem.id] }));
    updatePoem(setState, poem.id, (draft) => {
      draft.save_count = Math.max(0, Number(draft.save_count || 0) + (saved ? -1 : 1));
    });
  }
  function repost() {
    setState((prev) => persist({ ...prev, reposted: reposted ? prev.reposted.filter((id) => id !== poem.id) : [...prev.reposted, poem.id] }));
    updatePoem(setState, poem.id, (draft) => {
      draft.repost_count = Math.max(0, Number(draft.repost_count || 0) + (reposted ? -1 : 1));
    });
  }

  return (
    <motion.article layout className={`poem-card ${compact ? "compact" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="poem-card-top">
        <button className={`author ${author === "anonymous" ? "anon" : ""}`} onClick={() => author !== "anonymous" && openProfile(author)}>
          <span className="avatar-dot">{author === "anonymous" ? "A" : author.replace("verna", "V")}</span>
          {author}
        </button>
        <span>{timeAgo(poem.created_at)}</span>
      </div>
      <button className="poem-open" onClick={() => openThread(poem.id)}>
        {poem.title && <h2>{poem.title}</h2>}
        <p>{poem.content}</p>
      </button>
      <div className="poem-meta">
        <span>{poem.mood}</span>
        {(poem.tags || []).slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="poem-actions">
        <Action icon="reply" label={`${poem.reply_count || 0}`} onClick={() => openThread(poem.id)} />
        <Action icon="repost" label={`${poem.repost_count || 0}`} active={reposted} onClick={repost} />
        <Action icon="heart" label={`${total}`} onClick={() => react("felt_this")} />
        <Action icon="save" label={`${poem.save_count || 0}`} active={saved} onClick={save} />
      </div>
      <div className="reaction-row">
        {["felt this", "beautiful", "same", "save me"].map((label) => <button key={label} onClick={() => react(label.replace(/\s/g, "_"))}>{label}</button>)}
      </div>
    </motion.article>
  );
}

function Action({ icon, label, active, onClick }) {
  return (
    <button className={`action ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );
}

function ThreadScreen({ state, setState, postId, onBack, openProfile, openComposer }) {
  const root = state.poems.find((poem) => poem.id === postId);
  const replies = state.poems.filter((poem) => poem.parent_post_id === postId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (!root) {
    return (
      <>
        <Header title="Poem thread" back={<button className="icon-button" onClick={onBack}><Icon name="back" /></button>} />
        <EmptyState title="Poem not found" body="Return to the feed and open another poem." />
      </>
    );
  }
  return (
    <>
      <Header
        eyebrow={`${replies.length} poem replies`}
        title="Poem thread"
        subtitle="The conversation becomes the artwork."
        back={<button className="icon-button" onClick={onBack}><Icon name="back" /></button>}
      />
      <div className="thread-line">
        <PoemCard poem={root} state={state} setState={setState} openProfile={openProfile} openThread={() => {}} />
        <div className="thread-cta">
          <AppButton onClick={() => openComposer(root)}><Icon name="reply" size={17} /> Reply with a poem</AppButton>
        </div>
        {replies.map((poem) => <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={openProfile} openThread={() => {}} compact />)}
      </div>
    </>
  );
}

function ProfileScreen({ state, setState, openProfile, openThread }) {
  const myPosts = state.poems.filter((poem) => poem.author_handle === state.me.verna_handle);
  const rootPosts = myPosts.filter((poem) => !poem.parent_post_id);
  const replies = myPosts.filter((poem) => poem.parent_post_id);
  const savedPoems = state.poems.filter((poem) => state.saved.includes(poem.id));
  const drafts = state.drafts || [];
  const freeLimit = state.me.subscription_tier === "free" ? 2 : "Unlimited";
  const usedThisMonth = rootPosts.length + drafts.filter((draft) => draft.status !== "posted").length;
  const profile = { ...state.profiles[state.me.verna_handle], handle: state.me.verna_handle };
  return (
    <>
      <Header eyebrow="Profile workspace" title="Profile" subtitle="Your auth identity, drafts, posts, saves, follows, and plan state." />
      <ProfileHero profile={profile} me={state.me} />
      <section className="profile-panel glass-card">
        <div className="section-kicker">Backend profile</div>
        <div className="profile-rows">
          <ProfileRow label="user_id" value={state.me.id} />
          <ProfileRow label="email" value={state.me.email} />
          <ProfileRow label="verna_handle" value={state.me.verna_handle} />
          <ProfileRow label="subscription_tier" value={state.me.subscription_tier} />
          <ProfileRow label="onboarding_goal" value={state.me.onboarding_goal} />
        </div>
      </section>
      <section className="metric-grid">
        <div className="metric-card"><span>Root posts</span><strong>{rootPosts.length}</strong></div>
        <div className="metric-card"><span>Replies</span><strong>{replies.length}</strong></div>
        <div className="metric-card"><span>Drafts</span><strong>{drafts.length}</strong></div>
        <div className="metric-card"><span>Saved</span><strong>{savedPoems.length}</strong></div>
      </section>
      <section className="profile-panel glass-card">
        <div className="panel-head">
          <div>
            <div className="section-kicker">Plan usage</div>
            <h2>{state.me.subscription_tier} plan</h2>
          </div>
          <span>{usedThisMonth}/{freeLimit}</span>
        </div>
        <div className="usage-bar"><i style={{ width: `${Math.min(100, (usedThisMonth / 2) * 100)}%` }} /></div>
        <p>Free plan logic allows 2 poems per month before upgrade. Premium/creator removes the poem cap.</p>
      </section>
      {state.me.subscription_tier !== "premium" && state.me.subscription_tier !== "creator" && <PremiumPanel />}
      <SectionTitle title="Draft workspace" />
      {drafts.length === 0 ? <Notice>Saved rough text from `create-poem-draft` appears here before publishing.</Notice> : drafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)}
      <SectionTitle title="Published as your Verna ID" />
      {rootPosts.length === 0 ? <Notice>Posts published with `author_mode: verna_id` appear here after moderation approval.</Notice> : rootPosts.map((poem) => <PostRow key={poem.id} poem={poem} openThread={openThread} />)}
      <SectionTitle title="Saved posts" />
      {savedPoems.length === 0 ? <Notice>Posts saved through `poem_post_saves` will appear here.</Notice> : savedPoems.map((poem) => <PostRow key={poem.id} poem={poem} openThread={openThread} />)}
      <SectionTitle title="Following" />
      <section className="follow-list">
        {state.following.map((handle) => (
          <button className="follow-row" key={handle} onClick={() => openProfile(handle)}>
            <span>{handle}</span>
            <small>{state.profiles[handle]?.mood || "Poetry"}</small>
          </button>
        ))}
      </section>
      <section className="profile-panel glass-card">
        <div className="section-kicker">Frontend integration order</div>
        <ol className="endpoint-flow">
          <li>get-me loads profile, onboarding, tier, and handle.</li>
          <li>list-my-poems loads private drafts and owned posts.</li>
          <li>list-saved-poems loads saved feed objects.</li>
          <li>list-following-feed powers the Following feed tab.</li>
        </ol>
      </section>
    </>
  );
}

function PremiumPanel() {
  return (
    <section className="premium-panel">
      <div>
        <div className="section-kicker">Upgrade</div>
        <h2>Verna Premium</h2>
        <p>For writers who want the product to stay out of the way.</p>
      </div>
      <ul>
        <li>Unlimited poem drafts and publishes</li>
        <li>More AI polish actions per month</li>
        <li>Deeper saved-poem and profile archive</li>
        <li>Creator-ready publishing controls</li>
      </ul>
      <AppButton>Upgrade to Premium</AppButton>
    </section>
  );
}

function PublicProfileScreen({ state, setState, handle, onBack, openThread }) {
  const profile = state.profiles[handle] || { handle, followers: 0, poems: 0, bio: "A public Verna voice.", mood: "Hope" };
  const poems = state.poems.filter((poem) => poem.author_handle === handle && !poem.parent_post_id);
  const following = state.following.includes(handle);
  function follow() {
    setState((prev) => persist({ ...prev, following: following ? prev.following.filter((item) => item !== handle) : [...prev.following, handle] }));
  }
  return (
    <>
      <Header title={handle} subtitle="Public Verna profile" back={<button className="icon-button" onClick={onBack}><Icon name="back" /></button>} right={<AppButton variant={following ? "ghost" : "primary"} onClick={follow}>{following ? "Following" : "Follow"}</AppButton>} />
      <ProfileHero profile={profile} />
      {poems.map((poem) => <PoemCard key={poem.id} poem={poem} state={state} setState={setState} openProfile={() => {}} openThread={openThread} compact />)}
    </>
  );
}

function ProfileHero({ profile, me }) {
  return (
    <section className="profile-hero">
      <div className="profile-mark"><Icon name="logo" size={30} /></div>
      <h2>{profile.handle}</h2>
      <p>{profile.bio}</p>
      <div className="profile-pills">
        <span>{profile.followers || 0} followers</span>
        <span>{profile.poems || 0} poems</span>
        <span>{profile.mood || "Hope"}</span>
        {me?.subscription_tier && <span>{me.subscription_tier} plan</span>}
      </div>
    </section>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DraftCard({ draft }) {
  return (
    <article className="draft-card">
      <div><strong>{draft.status || "draft"} - {draft.mood}</strong><p>{draft.raw_text}</p></div>
      <span>{timeAgo(draft.created_at)}</span>
    </article>
  );
}

function PostRow({ poem, openThread }) {
  return (
    <button className="post-row" onClick={() => openThread(poem.id)}>
      <div>
        <strong>{poem.title || "Untitled poem"}</strong>
        <p>{poem.content.split("\n").filter(Boolean).slice(0, 2).join(" / ")}</p>
      </div>
      <span>{poem.save_count || 0} saves</span>
    </button>
  );
}

function Composer({ state, setState, parentPost, onClose, onPublished }) {
  const [mood, setMood] = useState(parentPost?.mood || "Hope");
  const [title, setTitle] = useState("");
  const [editorText, setEditorText] = useState("");
  const [authorMode, setAuthorMode] = useState("verna_id");
  const [error, setError] = useState("");

  function polish(kind) {
    const source = editorText;
    if (source.trim().length < 8) {
      setError("Write a few words first.");
      return;
    }
    const suggestion = buildPoemSuggestion(source, kind);
    setTitle((current) => current || suggestion.title);
    setEditorText(suggestion.content);
    setError("");
  }

  function saveDraft() {
    const source = editorText;
    if (!source.trim()) return setError("Write something before saving.");
    setState((prev) => persist({ ...prev, authed: true, drafts: [{ id: `d-${Date.now()}`, raw_text: source.trim(), mood, created_at: new Date().toISOString() }, ...prev.drafts] }));
    onClose();
  }

  function publish() {
    const source = editorText;
    if (!source.trim()) return setError("Write something before posting.");
    const newPoem = buildNewPoem({ state, title, content: source, mood, authorMode, parentPost });
    setState((prev) => {
      const poems = [newPoem, ...prev.poems].map((poem) => parentPost?.id && poem.id === parentPost.id ? { ...poem, reply_count: Number(poem.reply_count || 0) + 1 } : poem);
      return persist({ ...prev, authed: true, onboardingComplete: true, poems });
    });
    onPublished(parentPost?.id || newPoem.id);
    onClose();
  }

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="composer-sheet" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}>
        <header className="composer-head">
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
          <div>
            <div className="eyebrow">{parentPost ? "Reply with a poem" : "New poem"}</div>
            <h2>{parentPost ? "Answer the feeling" : "What are you feeling?"}</h2>
          </div>
          <AppButton onClick={publish}>Publish</AppButton>
        </header>
        {parentPost && <div className="reply-context"><span>Replying to</span><p>{parentPost.content.split("\n").slice(0, 4).join(" / ")}</p></div>}
        <div className="composer-body">
          <HorizontalChips values={moods} active={mood} setActive={setMood} compact />
          <div className="identity-toggle">
            <button className={authorMode === "verna_id" ? "active" : ""} onClick={() => setAuthorMode("verna_id")}>Post as {state.me.verna_handle}</button>
            <button className={authorMode === "anonymous" ? "active" : ""} onClick={() => setAuthorMode("anonymous")}>Anonymous</button>
          </div>
          <input className="composer-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title, optional" />
          <textarea className="composer-text" value={editorText} onChange={(event) => setEditorText(event.target.value)} placeholder="Start with rough words. Polish it only when you want." />
          <div className="tool-grid">
            <button onClick={() => polish("voice")}>Keep my voice</button>
            <button onClick={() => polish("vivid")}>More vivid</button>
            <button onClick={() => polish("short")}>Shorter</button>
            <button onClick={() => polish("ending")}>Stronger ending</button>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          <div className="composer-actions">
            <AppButton variant="ghost" onClick={saveDraft}>Save draft</AppButton>
            <AppButton variant="primary" onClick={publish}>{parentPost ? "Reply with poem" : "Publish poem"}</AppButton>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function AuthScreen({ setState }) {
  function enter(mode) {
    setState((prev) => persist({
      ...prev,
      authed: true,
      onboardingComplete: true,
      authMode: mode,
      preferredMoods: prev.preferredMoods?.length ? prev.preferredMoods : ["Heartbreak", "Hope"],
    }));
  }
  return (
    <main className="auth-page">
      <Style />
      <section className="auth-shell">
        <div className="auth-copy">
          <div className="brand-lockup"><Icon name="logo" /><span>Verna</span></div>
          <p className="auth-kicker">Poem-first social writing</p>
          <h1>Write privately. Publish when ready. Let replies become poems.</h1>
          <p>Verna is a focused poetry feed with drafts, anonymous posting, saved poems, and profile identity built around the backend flow.</p>
          <div className="auth-actions">
            <AppButton onClick={() => enter("signup")}>Sign up</AppButton>
            <AppButton variant="ghost" onClick={() => enter("login")}>Log in</AppButton>
          </div>
        </div>
        <div className="auth-preview">
          <div className="preview-top">
            <span>Feed</span>
            <small>approved posts</small>
          </div>
          <article>
            <strong>after the noise</strong>
            <p>i stopped asking the room<br />to become gentle<br /><br />and became quiet enough<br />to hear myself leave</p>
          </article>
          <div className="preview-grid">
            <span>Drafts</span>
            <span>Saves</span>
            <span>Profile</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function HorizontalChips({ values, active, setActive, compact = false }) {
  return (
    <div className={`chip-strip ${compact ? "compact" : ""}`}>
      {values.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}
    </div>
  );
}

function SectionTitle({ title }) {
  return <div className="section-title">{title}</div>;
}

function Notice({ children, tone = "info" }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

function EmptyState({ title, body }) {
  return <section className="empty"><h2>{title}</h2><p>{body}</p></section>;
}

function buildNewPoem({ state, title = "", content, mood, authorMode, parentPost = null }) {
  return {
    id: `p-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    author_handle: authorMode === "verna_id" ? state.me.verna_handle : null,
    author_mode: authorMode,
    title: title.trim() || null,
    content: content.trim(),
    mood,
    tags: [mood.toLowerCase().replace(/\s/g, "-")],
    created_at: new Date().toISOString(),
    reaction_counts: {},
    reply_count: 0,
    repost_count: 0,
    save_count: 0,
    parent_post_id: parentPost?.id || null,
  };
}

function buildPoemSuggestion(text, kind) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  const first = words.slice(0, 5).join(" ").toLowerCase();
  const last = words.slice(-6).join(" ").toLowerCase();
  const titles = { voice: "same voice", vivid: "room of water", short: "small proof", ending: "last line" };
  return {
    title: titles[kind] || "what remained",
    content: [
      first || "i held the thought",
      "until it became quieter",
      "",
      "not an answer",
      "not a performance",
      "",
      last || "just the truth learning to stand",
    ].join("\n"),
  };
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

function scorePoem(poem) {
  return Object.values(poem.reaction_counts || {}).reduce((sum, count) => sum + Number(count || 0), 0) + Number(poem.save_count || 0);
}

function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function VernApp() {
  const [state, setState] = useState(loadState);
  const [nav, setNav] = useState("feed");
  const [threadId, setThreadId] = useState(null);
  const [profileHandle, setProfileHandle] = useState("");
  const [composer, setComposer] = useState(null);

  if (!state.authed) {
    return <AuthScreen setState={setState} />;
  }

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
    screen = <FeedScreen state={state} setState={setState} openProfile={openProfile} openThread={openThread} openComposer={() => openComposer()} />;
  }

  return (
    <AppShell nav={nav} setNav={setNav} openComposer={openComposer}>
      <AnimatePresence mode="wait">
        <motion.div key={`${nav}-${threadId || profileHandle}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {screen}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {composer && <Composer state={state} setState={setState} parentPost={composer.parentPost} onClose={() => setComposer(null)} onPublished={(id) => { setThreadId(id); setNav("thread"); }} />}
      </AnimatePresence>
    </AppShell>
  );
}

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,700;1,500&display=swap');
      :root {
        --bg: #f4f1ea;
        --bg2: #e8eee7;
        --ink: #17221d;
        --cream: #fffdf8;
        --muted: #69736e;
        --faint: rgba(23,34,29,.12);
        --glass: #fffdf8;
        --glass2: #f7f4ed;
        --green: #2f6b4f;
        --green2: #5f956f;
        --rose: #a85f68;
        --blue: #57799b;
        --gold: #a8822f;
        --shadow: 0 18px 50px rgba(31,45,38,.13);
      }
      * { box-sizing: border-box; }
      html, body, #root { min-height: 100%; }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: Jost, system-ui, sans-serif; }
      button, input, textarea { font: inherit; }
      button { -webkit-tap-highlight-color: transparent; }
      .app-shell { min-height: 100vh; padding: 18px 12px 98px; position: relative; overflow-x: hidden; background: linear-gradient(180deg, #faf7f0, var(--bg)); }
      .phone-frame { max-width: 780px; min-height: calc(100vh - 116px); margin: 0 auto; position: relative; border: 1px solid rgba(23,34,29,.12); border-radius: 28px; overflow: hidden; background: var(--cream); box-shadow: var(--shadow); }
      .phone-frame::before { content: ""; display: block; height: 3px; background: linear-gradient(90deg, var(--green), var(--blue), var(--gold)); opacity: .9; }
      .topbar { position: sticky; top: 0; z-index: 20; min-height: 82px; padding: 18px 18px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: rgba(255,253,248,.97); border-bottom: 1px solid var(--faint); }
      .topbar-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .topbar h1 { margin: 0; font-family: "Playfair Display", serif; font-size: 31px; line-height: 1; letter-spacing: 0; }
      .topbar p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
      .eyebrow, .section-kicker { color: var(--green); text-transform: uppercase; letter-spacing: .14em; font-size: 10px; font-weight: 800; }
      .icon-button { width: 42px; height: 42px; border: 1px solid var(--faint); color: var(--ink); border-radius: 50%; background: #fff; display: grid; place-items: center; cursor: pointer; }
      .btn { border: 1px solid var(--faint); border-radius: 999px; padding: 11px 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; cursor: pointer; transition: transform .15s, background .15s; }
      .btn:hover { transform: translateY(-1px); }
      .btn-primary { background: var(--green); color: #fff; border-color: var(--green); }
      .btn-ghost { background: var(--glass); color: var(--ink); }
      .glass-card, .poem-card, .profile-hero, .draft-card, .post-row, .follow-row { background: #fff; border: 1px solid var(--faint); box-shadow: 0 10px 28px rgba(31,45,38,.07); }
      .chip-strip button, .reaction-row button, .tool-grid button { border: 1px solid var(--faint); background: #fff; color: var(--muted); border-radius: 999px; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
      .chip-strip button.active { color: #fff; background: var(--green); border-color: var(--green); }
      .split-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .tab-row { display: grid; border-block: 1px solid var(--faint); }
      .tab-row.three { grid-template-columns: repeat(3, 1fr); }
      .tab-row button { height: 54px; color: var(--muted); border: 0; background: transparent; cursor: pointer; font-weight: 800; }
      .tab-row button.active { color: var(--green); background: #edf4ed; }
      .chip-strip { display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; scrollbar-width: none; }
      .chip-strip.compact { padding: 0 0 8px; }
      .feed-list { display: grid; gap: 14px; padding: 14px 14px 24px; }
      .poem-card { border-radius: 18px; padding: 18px; position: relative; overflow: hidden; }
      .poem-card::before { content: none; }
      .poem-card.compact { padding: 15px; border-radius: 16px; }
      .poem-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; color: var(--muted); font-size: 12px; }
      .author { border: 0; background: transparent; color: var(--green); display: inline-flex; align-items: center; gap: 8px; font-weight: 800; cursor: pointer; padding: 0; }
      .author.anon { color: var(--rose); cursor: default; }
      .avatar-dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #edf4ed; color: var(--green); font-size: 11px; }
      .poem-open { width: 100%; border: 0; background: transparent; color: var(--ink); text-align: left; padding: 0; cursor: pointer; }
      .poem-open h2 { margin: 0 0 12px; font-size: 20px; font-family: "Playfair Display", serif; letter-spacing: 0; }
      .poem-open p { margin: 0; white-space: pre-wrap; font-family: "Playfair Display", Georgia, serif; font-size: 20px; line-height: 1.66; }
      .poem-meta { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
      .poem-meta span, .profile-pills span { color: var(--muted); border: 1px solid var(--faint); background: var(--glass2); border-radius: 999px; padding: 5px 9px; font-size: 11px; }
      .poem-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 15px; }
      .action { border: 0; background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 4px; cursor: pointer; }
      .action.active { color: var(--green); }
      .reaction-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
      .reaction-row button { font-size: 12px; padding: 6px 9px; }
      .bottom-nav { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 80; width: min(520px, calc(100vw - 24px)); height: 72px; border: 1px solid var(--faint); border-radius: 24px; background: #fffdf8; display: grid; grid-template-columns: 1fr 92px 1fr; align-items: center; box-shadow: var(--shadow); }
      .nav-item { border: 0; background: transparent; color: var(--muted); display: grid; place-items: center; gap: 3px; cursor: pointer; font-size: 10px; font-weight: 800; }
      .nav-item.active { color: var(--green); }
      .compose-fab { width: 74px; height: 58px; margin: 0 auto; border-radius: 22px; border: 0; background: var(--green); color: #fff; box-shadow: 0 12px 30px rgba(47,107,79,.22); display: grid; place-items: center; gap: 2px; cursor: pointer; font-size: 10px; font-weight: 900; }
      .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px 16px; }
      .metric-card { min-height: 78px; border: 1px solid var(--faint); border-radius: 16px; padding: 12px; background: #fff; display: grid; align-content: space-between; box-shadow: 0 8px 22px rgba(31,45,38,.05); }
      .metric-card span { color: var(--muted); font-size: 12px; }
      .metric-card strong { font-family: "Playfair Display", serif; font-size: 24px; color: var(--green); }
      .section-title { padding: 16px 18px 8px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .14em; font-weight: 800; }
      .profile-hero p, .draft-card p { color: var(--muted); line-height: 1.55; }
      .thread-line { position: relative; }
      .thread-line::before { content: ""; position: absolute; left: 32px; top: 150px; bottom: 30px; width: 1px; background: linear-gradient(var(--green), transparent); opacity: .3; }
      .thread-cta { padding: 4px 16px 16px; }
      .thread-cta .btn { width: 100%; }
      .profile-hero { margin: 16px; padding: 22px; border-radius: 18px; text-align: center; }
      .profile-mark { width: 68px; height: 68px; margin: 0 auto 12px; border: 1px solid rgba(47,107,79,.2); border-radius: 20px; display: grid; place-items: center; background: #edf4ed; color: var(--green); }
      .profile-hero h2 { margin: 0; font-family: "Playfair Display", serif; font-size: 34px; }
      .profile-pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 12px; }
      .profile-panel { margin: 16px; padding: 17px; border-radius: 18px; }
      .profile-panel p { color: var(--muted); line-height: 1.55; margin: 12px 0 0; }
      .profile-rows { display: grid; gap: 8px; margin-top: 12px; }
      .profile-row { display: grid; grid-template-columns: 150px 1fr; gap: 10px; padding: 10px; border-radius: 12px; background: var(--glass2); border: 1px solid var(--faint); }
      .profile-row span { color: var(--muted); font-size: 12px; }
      .profile-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ink); }
      .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .panel-head h2 { margin: 4px 0 0; font-family: "Playfair Display", serif; font-size: 25px; text-transform: capitalize; }
      .panel-head > span { color: var(--green); font-weight: 900; }
      .usage-bar { height: 10px; overflow: hidden; border-radius: 999px; background: #e7e1d7; margin-top: 14px; }
      .usage-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--green), var(--gold)); }
      .premium-panel { margin: 16px; padding: 18px; border-radius: 18px; background: #17221d; color: #fffdf8; box-shadow: 0 16px 40px rgba(23,34,29,.18); }
      .premium-panel .section-kicker { color: #b8d8b4; }
      .premium-panel h2 { margin: 6px 0 8px; font-family: "Playfair Display", serif; font-size: 31px; line-height: 1; }
      .premium-panel p { color: rgba(255,253,248,.72); line-height: 1.5; margin: 0; }
      .premium-panel ul { display: grid; gap: 8px; padding-left: 18px; margin: 16px 0; color: rgba(255,253,248,.82); }
      .premium-panel .btn { width: 100%; background: #fffdf8; color: #17221d; border-color: #fffdf8; }
      .draft-card { margin: 0 16px 10px; padding: 14px; border-radius: 16px; display: flex; justify-content: space-between; gap: 12px; }
      .draft-card p { margin: 6px 0 0; font-size: 13px; }
      .draft-card span { color: var(--muted); font-size: 12px; white-space: nowrap; }
      .post-row, .follow-row { width: calc(100% - 32px); min-height: 72px; margin: 0 16px 10px; border-radius: 16px; color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; text-align: left; cursor: pointer; }
      .post-row strong, .follow-row span { display: block; font-size: 14px; }
      .post-row p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
      .post-row span, .follow-row small { color: var(--green); white-space: nowrap; font-size: 12px; }
      .follow-list { padding-bottom: 6px; }
      .endpoint-flow { margin: 12px 0 0; padding-left: 20px; color: var(--muted); line-height: 1.75; }
      .modal-backdrop { position: fixed; inset: 0; z-index: 120; background: rgba(23,34,29,.32); display: grid; place-items: end center; padding: 14px; }
      .composer-sheet { width: min(760px, 100%); max-height: min(880px, calc(100vh - 28px)); overflow: auto; border: 1px solid var(--faint); border-radius: 24px; background: var(--cream); box-shadow: var(--shadow); }
      .composer-head { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 12px; padding: 16px; background: var(--cream); border-bottom: 1px solid var(--faint); }
      .composer-head h2 { margin: 2px 0 0; font-family: "Playfair Display", serif; }
      .composer-body { padding: 16px; }
      .reply-context { margin: 14px 16px 0; padding: 14px; border: 1px solid var(--faint); border-radius: 16px; color: var(--muted); background: #fff; }
      .reply-context span { color: var(--green); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
      .reply-context p { margin: 5px 0 0; }
      .identity-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 12px; }
      .identity-toggle button { border: 1px solid var(--faint); border-radius: 14px; background: #fff; color: var(--muted); padding: 12px; cursor: pointer; }
      .identity-toggle button.active { color: var(--green); border-color: rgba(47,107,79,.35); background: #edf4ed; }
      .composer-title, .composer-text { width: 100%; border: 1px solid var(--faint); background: #fff; color: var(--ink); outline: 0; border-radius: 16px; padding: 14px; }
      .composer-title { margin-bottom: 10px; }
      .composer-text { min-height: 260px; resize: vertical; font-family: "Playfair Display", serif; font-size: 21px; line-height: 1.7; }
      .tool-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px; }
      .composer-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
      .notice { margin: 12px 0; padding: 12px; border-radius: 14px; border: 1px solid var(--faint); color: var(--muted); background: #fff; }
      .notice.warn { color: #ffd0d0; border-color: rgba(219,162,162,.4); }
      .empty { padding: 28px; color: var(--muted); }
      .empty h2 { color: var(--ink); font-family: "Playfair Display", serif; }
      .brand-lockup { display: inline-flex; align-items: center; gap: 10px; color: var(--green); font-weight: 900; margin-bottom: 22px; }
      .auth-page { min-height: 100vh; background: linear-gradient(180deg, #fbf8f1, #ebe4d7); display: grid; place-items: center; padding: 24px; }
      .auth-shell { width: min(1040px, 100%); display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 24px; align-items: stretch; }
      .auth-copy, .auth-preview { background: #fffdf8; border: 1px solid var(--faint); border-radius: 24px; box-shadow: var(--shadow); }
      .auth-copy { padding: clamp(26px, 5vw, 54px); display: flex; flex-direction: column; justify-content: center; }
      .auth-kicker { margin: 0 0 10px; color: var(--green); font-weight: 900; text-transform: uppercase; letter-spacing: .14em; font-size: 11px; }
      .auth-copy h1 { margin: 0; max-width: 680px; font-family: "Playfair Display", serif; font-size: clamp(44px, 6vw, 76px); line-height: .98; letter-spacing: 0; }
      .auth-copy > p:not(.auth-kicker) { max-width: 560px; margin: 18px 0 0; color: var(--muted); line-height: 1.65; font-size: 16px; }
      .auth-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
      .auth-actions .btn { min-width: 132px; }
      .auth-preview { padding: 22px; align-self: stretch; display: grid; align-content: center; gap: 16px; background: #17221d; color: #fffdf8; }
      .preview-top { display: flex; justify-content: space-between; color: rgba(255,253,248,.72); font-size: 12px; text-transform: uppercase; letter-spacing: .12em; font-weight: 900; }
      .auth-preview article { border: 1px solid rgba(255,255,255,.14); border-radius: 18px; background: rgba(255,255,255,.06); padding: 20px; }
      .auth-preview strong { font-family: "Playfair Display", serif; font-size: 26px; }
      .auth-preview p { font-family: "Playfair Display", serif; font-size: 22px; line-height: 1.62; margin: 18px 0 0; color: rgba(255,253,248,.9); }
      .preview-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .preview-grid span { border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 12px; text-align: center; color: rgba(255,253,248,.8); font-weight: 800; }
      @media (max-width: 560px) {
        .app-shell { padding: 0 0 92px; }
        .phone-frame { min-height: calc(100vh - 92px); border-radius: 0; border-inline: 0; }
        .topbar h1 { font-size: 27px; }
        .metric-grid { grid-template-columns: repeat(2, 1fr); }
        .profile-row { grid-template-columns: 1fr; gap: 3px; }
        .split-actions, .composer-actions { grid-template-columns: 1fr; }
        .poem-open p, .composer-text { font-size: 19px; }
        .bottom-nav { bottom: 8px; height: 68px; border-radius: 22px; }
      }
      @media (max-width: 820px) {
        .auth-page { padding: 0; }
        .auth-shell { grid-template-columns: 1fr; min-height: 100vh; }
        .auth-copy, .auth-preview { border-radius: 0; box-shadow: none; }
      }
    `}</style>
  );
}
