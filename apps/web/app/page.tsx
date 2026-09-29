"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

type FeedVideo = {
  id: string;
  ownerId?: string;
  owner?: { username?: string };
  ownerUsername?: string;
  caption?: string;
  mediaType?: "VIDEO"|"PHOTO"|"TEXT";
  photos?: string[];
  textBody?: string;
  hashtags?: string[];
  playback?: { hlsUrl?: string; mp4Url?: string };
  thumbnail?: string | null;
  country?: string;
  autoCaptionsUrl?: string;
  autoCaptionsStatus?: string;
  autoCaptionLanguage?: string;
  captionTracks?: Record<string, { language: string; label: string; url: string; sourceLanguage?: string }>;
  engagement?: { likeCount: number; commentCount: number; shareCount: number; saveCount: number; repostCount: number; liked: boolean; saved: boolean; reposted: boolean };
};

const demoVideos: FeedVideo[] = [
  { id: "demo-1", ownerUsername: "@kofi_creates", country: "Ghana", caption: "Accra after sunset 🌍✨", hashtags: ["Ghana","Africa","TwiTok"] },
  { id: "demo-2", ownerUsername: "@amakaofficial", country: "Nigeria", caption: "Our culture, our story.", hashtags: ["Nigeria","Culture","Africa"] },
  { id: "demo-3", ownerUsername: "@zuri_daily", country: "Kenya", caption: "A morning in Nairobi.", hashtags: ["Kenya","Nairobi","TwiTok"] }
];

const tabs = [
  { label: "You", surface: "FOR_YOU" },
  { label: "Following", surface: "FOLLOWING" },
  { label: "Explore Africa", surface: "AFRICA" }
] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof tabs)[number]["surface"]>("FOR_YOU");
  const [videos, setVideos] = useState<FeedVideo[]>(demoVideos);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const activeRef = useRef<string | null>(null);
  const [soundMap, setSoundMap] = useState<Record<string, { _id: string; title: string; artist: string }>>({});
  const [captionLanguage, setCaptionLanguage] = useState<Record<string, string>>({});
  const [translationBusy, setTranslationBusy] = useState<Record<string, boolean>>({});
  const [commentsVideoId, setCommentsVideoId] = useState<string | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; userId: string; text: string; createdAt: string }>>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; type: string; read: boolean; createdAt: string; videoId: string | null; actor: { username?: string; nickname?: string } | null }>>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [stories, setStories] = useState<Array<{id:string;username:string;nickname:string;playback?:{mp4Url?:string;hlsUrl?:string}|null;thumbnail?:string|null;caption:string;viewed:boolean}>>([]);
  const [storyOpen, setStoryOpen] = useState<string | null>(null);
  const [giftCatalog, setGiftCatalog] = useState<Array<{ giftId: string; name: string; coins: number; animation: string }>>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [giftVideoId, setGiftVideoId] = useState<string | null>(null);
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftAttemptCoins, setGiftAttemptCoins] = useState<number | null>(null);
  const [giftBursts, setGiftBursts] = useState<Array<{ id: string; videoId: string; emoji: string; label: string; quantity: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("twitok_user_token") : null;
      if (!token) return;
      setFeedLoading(true);
      try {
        const response = await fetch(api + "/feed/" + tab + "?limit=10", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data.videos) ? data.videos : Array.isArray(data.items) ? data.items : [];
        if (!cancelled) { setVideos(items.length ? items : demoVideos); setFeedCursor(data.nextCursor ?? null); }
      } catch {} finally { if (!cancelled) setFeedLoading(false); }
    }
    setFeedCursor(null);
    load();
    return () => { cancelled = true; };
  }, [api, tab]);

  async function loadMoreFeed() {
    if (feedLoading || !feedCursor) return;
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    setFeedLoading(true);
    try {
      const response = await fetch(api + "/feed/" + tab + "?limit=10&cursor=" + encodeURIComponent(feedCursor), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const items = Array.isArray(data.videos) ? data.videos : [];
      setVideos(current => [...current, ...items]);
      setFeedCursor(data.nextCursor ?? null);
    } catch {} finally { setFeedLoading(false); }
  }

  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - window.innerHeight * 1.5) void loadMoreFeed();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [feedCursor, feedLoading, tab]);

  useEffect(() => {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    let cancelled = false;
    async function loadNotifications() {
      try {
        const [listResponse, countResponse] = await Promise.all([
          fetch(api + "/notifications?limit=30", { headers: { Authorization: "Bearer " + token }, cache: "no-store" }),
          fetch(api + "/notifications/unread-count", { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
        ]);
        if (cancelled) return;
        if (listResponse.ok) { const data = await listResponse.json(); setNotifications(Array.isArray(data.notifications) ? data.notifications : []); }
        if (countResponse.ok) { const data = await countResponse.json(); setUnreadNotifications(Number(data.count ?? 0)); }
      } catch {}
    }
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [api]);

  useEffect(() => {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    let cancelled = false;
    Promise.all([
      fetch(api + "/wallet/catalog", { cache: "no-store" }),
      fetch(api + "/wallet/me", { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
    ]).then(async ([catalogResponse, walletResponse]) => {
      if (cancelled) return;
      if (catalogResponse.ok) {
        const data = await catalogResponse.json();
        setGiftCatalog(Array.isArray(data.gifts) ? data.gifts : []);
      }
      if (walletResponse.ok) {
        const data = await walletResponse.json();
        setCoinBalance(Math.floor(Number(data.coinBalance ?? 0)));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    const realtimeBase = api.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const socket = new WebSocket(realtimeBase.replace(/\/api\/v1\/?$/, "") + "/realtime");
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "auth", token })));
    socket.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "notification:new") setUnreadNotifications(count => count + 1);
        if (data?.type === "gift.received" || data?.type === "gift.sent") {
          const emoji = giftEmoji(data.animation);
          const videoId = String(data.videoId ?? "");
          if (videoId) {
            const burst = { id: String(data.transactionId ?? crypto.randomUUID()), videoId, emoji, label: data.type === "gift.received" ? "Gift received" : "Gift sent", quantity: Number(data.quantity ?? 1) };
            setGiftBursts(items => [...items.slice(-4), burst]);
            window.setTimeout(() => setGiftBursts(items => items.filter(item => item.id !== burst.id)), 2600);
          }
        }
      } catch {}
    });
    return () => socket.close();
  }, []);

  async function sendGift(giftId: string) {
    const token = window.localStorage.getItem("twitok_user_token");
    const video = videos.find(item => item.id === giftVideoId);
    const gift = giftCatalog.find(item => item.giftId === giftId);
    if (!token || !video?.ownerId || !gift) { setGiftMessage("Sign in and select a creator video."); return; }
    const totalCoins = gift.coins * giftQuantity;
    if (coinBalance < totalCoins) { setGiftAttemptCoins(totalCoins); setGiftMessage(`Not enough Coins for ${gift.name} ×${giftQuantity}.`); return; }
    setGiftAttemptCoins(null);
    setGiftBusy(true);
    setGiftMessage("");
    try {
      const response = await fetch(api + "/wallet/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ receiverId: video.ownerId, giftId, quantity: giftQuantity, context: "VIDEO", videoId: video.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setGiftMessage(data.error ?? "Gift could not be sent."); return; }
      setCoinBalance(balance => Math.max(0, balance - Number(data.coinsSpent ?? totalCoins)));
      setGiftMessage(gift.name + " × " + Number(data.quantity ?? giftQuantity) + " sent!");
    } catch { setGiftMessage("Network error. Please try again."); }
    finally { setGiftBusy(false); }
  }

  async function openStory(storyId: string) {
    setStoryOpen(storyId);
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    try {
      await fetch(api + "/stories/" + encodeURIComponent(storyId) + "/view", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      });
      setStories(items => items.map(item => item.id === storyId ? { ...item, viewed: true } : item));
    } catch {}
  }

  async function openNotifications() {
    setNotificationsOpen(true);
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    try {
      const response = await fetch(api + "/notifications/read", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}" });
      if (response.ok) { setNotifications(items => items.map(item => ({ ...item, read: true }))); setUnreadNotifications(0); }
    } catch {}
  }

  useEffect(() => {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) return;
    let cancelled = false;
    Promise.all(videos.filter(v => !v.id.startsWith("demo-")).map(async v => {
      try { const r = await fetch(`${api}/music/videos/${v.id}/sound`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); return d.sound ? [v.id, d.sound] as const : null; } catch { return null; }
    })).then(items => { if (!cancelled) setSoundMap(prev => { const next = { ...prev }; items.forEach(item => { if (item) next[item[0]] = item[1]; }); return next; }); });
    return () => { cancelled = true; };
  }, [videos, api]);

  async function track(videoId: string, type: string, watchMs = 0) {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || videoId.startsWith("demo-")) return;
    try {
      await fetch(`${api}/feed/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId, type, watchMs, sessionId: activeRef.current })
      });
    } catch {}
  }

  useEffect(() => {
    document.querySelectorAll<HTMLVideoElement>(".real-video").forEach(video => {
      const selected = video.dataset.captionLanguage ?? "";
      Array.from(video.textTracks).forEach(track => {
        track.mode = selected && track.language === selected ? "showing" : "hidden";
      });
    });
  }, [videos, captionLanguage]);

  async function engage(videoId: string, action: "like" | "save" | "share" | "repost") {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || videoId.startsWith("demo-")) return;
    try {
      if (action === "share" && typeof navigator.share === "function") {
        await navigator.share({ title: "TwiTok", text: "Watch this video on TwiTok", url: window.location.origin + "/video/" + videoId });
      } else if (action === "share") {
        await navigator.clipboard?.writeText(window.location.origin + "/video/" + videoId);
      }
      const response = await fetch(`${api}/engagement/${videoId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.engagement) setVideos(items => items.map(item => item.id === videoId ? { ...item, engagement: data.engagement } : item));
      track(videoId, action === "like" ? "LIKE" : action === "save" ? "SAVE" : action === "repost" ? "SHARE" : "SHARE");
    } catch {}
  }

  async function remixVideo(videoId: string, mode: "DUET" | "STITCH") {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || videoId.startsWith("demo-")) return;
    try {
      const response = await fetch(api + "/video/" + encodeURIComponent(videoId) + "/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ mode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to start remix");
      if (data.remix?.remixId) window.location.href = "/remix/" + encodeURIComponent(data.remix.remixId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Unable to start remix");
    }
  }

  async function openComments(videoId: string) {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || videoId.startsWith("demo-")) return;
    setCommentsVideoId(videoId);
    setCommentsBusy(true);
    try {
      const response = await fetch(`${api}/engagement/${videoId}/comments?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) { const data = await response.json(); setComments(Array.isArray(data.comments) ? data.comments : []); }
    } finally { setCommentsBusy(false); }
  }

  async function submitComment() {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || !commentsVideoId || !commentDraft.trim()) return;
    const text = commentDraft.trim().slice(0, 500);
    setCommentsBusy(true);
    try {
      const response = await fetch(`${api}/engagement/${commentsVideoId}/comments`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
      if (!response.ok) return;
      const data = await response.json();
      if (data.comment) setComments(items => [data.comment, ...items]);
      setCommentDraft("");
      const engagementResponse = await fetch(`${api}/engagement/${commentsVideoId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (engagementResponse.ok) { const engagement = await engagementResponse.json(); setVideos(items => items.map(item => item.id === commentsVideoId ? { ...item, engagement } : item)); }
      track(commentsVideoId, "COMMENT");
    } finally { setCommentsBusy(false); }
  }

  async function requestTranslation(videoId: string, language: string) {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || !language) return;
    setTranslationBusy(prev => ({ ...prev, [videoId]: true }));
    try {
      const response = await fetch(`${api}/video/${videoId}/caption-translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ targetLanguage: language })
      });
      if (!response.ok) return;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        const tracksResponse = await fetch(`${api}/video/${videoId}/caption-tracks`, {
          headers: { Authorization: "Bearer " + token }
        });
        if (!tracksResponse.ok) continue;
        const data = await tracksResponse.json();
        const track = Array.isArray(data.tracks) ? data.tracks.find((x: any) => x.language === language) : null;
        if (track) {
          setVideos(items => items.map(item => item.id === videoId
            ? { ...item, captionTracks: { ...(item.captionTracks ?? {}), [language]: track } }
            : item));
          setCaptionLanguage(prev => ({ ...prev, [videoId]: language }));
          break;
        }
      }
    } finally {
      setTranslationBusy(prev => ({ ...prev, [videoId]: false }));
    }
  }

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-video-id]"));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target.querySelector<HTMLVideoElement>("video");
        const id = (entry.target as HTMLElement).dataset.videoId ?? "";
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          activeRef.current = crypto.randomUUID();
          video.muted = muted;
          video.play().catch(() => {});
          track(id, "VIEW_START");
        } else {
          video.pause();
        }
      });
    }, { threshold: [0, 0.7, 1] });
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [videos, muted]);

  return <main className="app">
    <aside className="rail">
      <div className="logo">T<span>▶</span>iTok</div>
      <nav>
        <Link href="/">⌂ <span>Home</span></Link>
        <Link href="/discover">⌕ <span>Discover</span></Link>
        <Link href="/live">◉ <span>LIVE</span></Link>
        <Link href="/creator/studio">▣ <span>Creator Studio</span></Link>
        <Link href="/inbox">✉ <span>Inbox</span></Link>
      </nav>
      <div className="rail-bottom"><Link className="primary" href="/create">＋ Create</Link><small>Africa's Video Platform</small></div>
    </aside>

    <section className="feed">
      <header className="top">
        <div className="mobile-logo">TwiTok</div>
        <div className="tabs">{tabs.map(t =>
          <button key={t.surface} className={tab === t.surface ? "selected" : ""} onClick={() => setTab(t.surface)}>{t.label}</button>
        )}</div>
        <div className="top-actions"><button className="notification-button" onClick={openNotifications} aria-label="Notifications">♧{unreadNotifications > 0 ? <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</button><button className="sound-toggle" onClick={() => setMuted(v => !v)}>{muted ? "🔇" : "🔊"}</button></div>
      </header>

      {stories.length > 0 && <div className="story-tray" aria-label="Stories">
        {stories.map(story => <button className={"story-bubble " + (story.viewed ? "viewed" : "")} key={story.id} onClick={() => openStory(story.id)}>
          <span>{story.thumbnail ? <img src={story.thumbnail} alt="" /> : "▶"}</span><small>@{story.username || "creator"}</small>
        </button>)}
      </div>}

      <div className="vertical-feed">
        {videos.map((v, i) => {
          const playback = v.playback?.mp4Url ?? v.playback?.hlsUrl;
          return <article className="video-card" data-video-id={v.id} key={v.id}>
            <div className="video-stage">
              {v.mediaType === "TEXT"
                ? <div className="video-art demo-art-0" style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"36px"}}><div className="demo-mark" style={{fontSize:"28px",lineHeight:1.35}}>{v.textBody || v.caption}</div></div>
                : v.mediaType === "PHOTO"
                  ? <div className="video-art" style={{display:"flex",gap:"8px",overflow:"auto",padding:"18px",alignItems:"center"}}>{(v.photos ?? []).map((photo,j)=><img key={photo+j} src={photo} alt="" style={{maxWidth:"88%",maxHeight:"82%",objectFit:"contain",borderRadius:"12px"}} />)}</div>
                  : playback
                    ? <video className="real-video" data-caption-language={captionLanguage[v.id] ?? v.autoCaptionLanguage ?? ""} src={playback} poster={v.thumbnail ?? undefined} playsInline loop controls={false} muted={muted} preload={i < 2 ? "auto" : "metadata"} onEnded={() => track(v.id, "VIEW_COMPLETE")}>
                        {v.autoCaptionsUrl ? <track kind="captions" src={v.autoCaptionsUrl} srcLang={v.autoCaptionLanguage ?? "en"} label="Original captions" /> : null}{Object.values(v.captionTracks ?? {}).map(captionTrack => <track key={captionTrack.language} kind="captions" src={captionTrack.url} srcLang={captionTrack.language} label={captionTrack.label} />)}
                      </video>
                    : <div className={`video-art demo-art-${i % 3}`}><div className="demo-mark">TwiTok</div></div>}
              <div className="gradient"/>
              {giftBursts.filter(b => b.videoId === v.id).map(b => <div key={b.id} style={giftStyles.burst}><span style={giftStyles.emojiLarge}>{b.emoji}</span><b>{b.label}{b.quantity > 1 ? " ×" + b.quantity : ""}</b></div>)}
              <div className="video-copy">
                <strong>{v.owner?.username ?? v.ownerUsername ?? "@creator"}{v.country ? ` · ${v.country}` : ""}</strong>
                <h2>{v.caption ?? ""}</h2>
                <p>{(v.hashtags ?? []).map(tag => `#${tag}`).join(" ")}</p>
                  <div className="caption-language"><select value={captionLanguage[v.id] ?? v.autoCaptionLanguage ?? ""} onChange={e => { const lang = e.target.value; if (lang === "__translate__") return; setCaptionLanguage(prev => ({ ...prev, [v.id]: lang })); }}><option value={v.autoCaptionLanguage ?? ""}>Original captions</option>{Object.values(v.captionTracks ?? {}).map(track => <option key={track.language} value={track.language}>{track.label}</option>)}<option value="__translate__" disabled={translationBusy[v.id]}>Translate captions…</option></select><div className="caption-translate-buttons">{["en","fr","tw","ha","yo","ig","sw","ar"].filter(lang => lang !== (v.autoCaptionLanguage ?? "") && !v.captionTracks?.[lang]).map(lang => <button key={lang} type="button" disabled={translationBusy[v.id]} onClick={() => requestTranslation(v.id, lang)}>{translationBusy[v.id] ? "Translating…" : `+${lang.toUpperCase()}`}</button>)}</div></div>
                {soundMap[v.id] && <Link className="video-sound" href={`/sound/${soundMap[v.id]._id}`}>♪ {soundMap[v.id].title} — {soundMap[v.id].artist}</Link>}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => engage(v.id, "like")} aria-label="Like video">{v.engagement?.liked ? "♥" : "♡"}<small>{v.engagement?.likeCount ?? 0}</small></button>
              <button onClick={() => openComments(v.id)} aria-label="Open comments">◌<small>{v.engagement?.commentCount ?? 0}</small></button>
              <button onClick={() => engage(v.id, "share")} aria-label="Share video">↗<small>{v.engagement?.shareCount ?? 0}</small></button>
              <button onClick={() => engage(v.id, "save")} aria-label="Save video">{v.engagement?.saved ? "▣" : "▱"}<small>{v.engagement?.saveCount ?? 0}</small></button>
              <button onClick={() => engage(v.id, "repost")} aria-label="Repost video">{v.engagement?.reposted ? "↻" : "⟳"}<small>{v.engagement?.repostCount ?? 0}</small></button>
              <button onClick={() => remixVideo(v.id, "DUET")} aria-label="Duet video">Duet</button>
              <button onClick={() => remixVideo(v.id, "STITCH")} aria-label="Stitch video">Stitch</button>
              <button onClick={() => { setGiftVideoId(v.id); setGiftMessage(""); setGiftAttemptCoins(null); }} aria-label="Send gift" style={giftStyles.giftButton}>🎁 Gift</button>
            </div>
          </article>;
        })}
      </div>
    </section>
    {storyOpen && (() => { const story = stories.find(item => item.id === storyOpen); const src = story?.playback?.mp4Url ?? story?.playback?.hlsUrl; return <div className="story-viewer" role="dialog" aria-modal="true" onClick={() => setStoryOpen(null)}>
      <button className="story-close" onClick={() => setStoryOpen(null)} aria-label="Close story">×</button>
      {story && <div className="story-card" onClick={e => e.stopPropagation()}>{src ? <video src={src} poster={story.thumbnail ?? undefined} autoPlay playsInline controls={false} onEnded={() => setStoryOpen(null)} /> : <div className="story-placeholder">TwiTok</div>}<div className="story-copy"><strong>@{story.username}</strong><p>{story.caption}</p></div></div>}
    </div>; })()}
    {notificationsOpen && <div className="comments-backdrop" role="presentation" onClick={() => setNotificationsOpen(false)}>
      <section className="comments-sheet notification-sheet" role="dialog" aria-modal="true" aria-label="Notifications" onClick={event => event.stopPropagation()}>
        <header className="comments-header"><strong>Notifications</strong><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button></header>
        <div className="comments-list">
          {notifications.length ? notifications.map(item => {
            const actor = item.actor?.username ? "@" + item.actor.username : "Someone";
            const text = item.type === "FOLLOW" ? "followed you" : item.type === "LIKE" ? "liked your video" : item.type === "REPOST" ? "reposted your video" : "commented on your video";
            return <article className={"comment-item " + (item.read ? "" : "notification-unread")} key={item.id}>
              <div className="comment-avatar">♥</div><div><strong>{actor}</strong><p>{text}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>
            </article>;
          }) : <p className="comments-empty">No notifications yet.</p>}
        </div>
      </section>
    </div>}
    {giftVideoId && <div className="comments-backdrop" role="presentation" onClick={() => !giftBusy && setGiftVideoId(null)}>
      <section onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Gift tray" style={giftStyles.sheet}>
        <div style={giftStyles.header}><div><strong>Send a Gift</strong><small style={giftStyles.balance}>🪙 {coinBalance.toLocaleString()} Coins</small></div><button type="button" onClick={() => { setGiftVideoId(null); setGiftAttemptCoins(null); }} style={giftStyles.close}>×</button></div>
        <div style={giftStyles.grid}>
          {giftCatalog.map(gift => <button key={gift.giftId} disabled={giftBusy} onClick={() => void sendGift(gift.giftId)} style={giftStyles.gift}>
            <span style={giftStyles.emoji}>{giftEmoji(gift.animation)}</span>
            <b>{gift.name}</b><small>{gift.coins.toLocaleString()} Coins</small>
          </button>)}
        </div>
        <div style={giftStyles.quantity}><span>Quantity</span>{[1,5,10].map(q => <button key={q} onClick={() => setGiftQuantity(q)} style={giftQuantity === q ? giftStyles.active : giftStyles.quantityButton}>×{q}</button>)}</div>
        {giftMessage && <p style={giftStyles.message}>{giftMessage}</p>}
        {giftAttemptCoins !== null && coinBalance < giftAttemptCoins && <div style={giftStyles.insufficient}>
          <span>🪙 You have {coinBalance.toLocaleString()} Coins, but need {giftAttemptCoins.toLocaleString()}.</span>
          <Link href="/wallet" style={giftStyles.buyCoins}>Buy Coins</Link>
        </div>}
      </section>
    </div>}
    {commentsVideoId && <div className="comments-backdrop" role="presentation" onClick={() => setCommentsVideoId(null)}>
      <section className="comments-sheet" role="dialog" aria-modal="true" aria-label="Comments" onClick={event => event.stopPropagation()}>
        <header className="comments-header"><strong>Comments</strong><button type="button" onClick={() => setCommentsVideoId(null)} aria-label="Close comments">×</button></header>
        <div className="comments-list">
          {commentsBusy && !comments.length ? <p className="comments-empty">Loading comments…</p> : comments.length ? comments.map(comment => <article className="comment-item" key={comment.id}>
            <div className="comment-avatar">{comment.userId.slice(-2).toUpperCase()}</div>
            <div><strong>@user</strong><p>{comment.text}</p><small>{new Date(comment.createdAt).toLocaleString()}</small></div>
          </article>) : <p className="comments-empty">No comments yet. Be the first to comment.</p>}
        </div>
        <form className="comment-form" onSubmit={event => { event.preventDefault(); submitComment(); }}>
          <input value={commentDraft} maxLength={500} onChange={event => setCommentDraft(event.target.value)} placeholder="Add a comment…" aria-label="Add a comment" />
          <button type="submit" disabled={commentsBusy || !commentDraft.trim()}>Post</button>
        </form>
      </section>
    </div>}
  </main>;
}


function giftEmoji(animation: string) {
  const icons: Record<string, string> = {
    rose: "🌹", heart: "❤️", clap: "👏", kente: "🟩", drum: "🥁",
    crown: "👑", lion: "🦁", diamond: "💎",
    usa_flag: "🇺🇸", germany_flag: "🇩🇪", canada_flag: "🇨🇦", uk_flag: "🇬🇧",
    algeria_flag: "🇩🇿",
    angola_flag: "🇦🇴",
    benin_flag: "🇧🇯",
    botswana_flag: "🇧🇼",
    burkina_faso_flag: "🇧🇫",
    burundi_flag: "🇧🇮",
    cabo_verde_flag: "🇨🇻",
    cameroon_flag: "🇨🇲",
    central_african_republic_flag: "🇨🇫",
    chad_flag: "🇹🇩",
    comoros_flag: "🇰🇲",
    congo_flag: "🇨🇬",
    dr_congo_flag: "🇨🇩",
    cote_divoire_flag: "🇨🇮",
    djibouti_flag: "🇩🇯",
    egypt_flag: "🇪🇬",
    equatorial_guinea_flag: "🇬🇶",
    eritrea_flag: "🇪🇷",
    eswatini_flag: "🇸🇿",
    ethiopia_flag: "🇪🇹",
    gabon_flag: "🇬🇦",
    gambia_flag: "🇬🇲",
    ghana_flag: "🇬🇭",
    guinea_flag: "🇬🇳",
    guinea_bissau_flag: "🇬🇼",
    kenya_flag: "🇰🇪",
    lesotho_flag: "🇱🇸",
    liberia_flag: "🇱🇷",
    libya_flag: "🇱🇾",
    madagascar_flag: "🇲🇬",
    malawi_flag: "🇲🇼",
    mali_flag: "🇲🇱",
    mauritania_flag: "🇲🇷",
    mauritius_flag: "🇲🇺",
    morocco_flag: "🇲🇦",
    mozambique_flag: "🇲🇿",
    namibia_flag: "🇳🇦",
    niger_flag: "🇳🇪",
    nigeria_flag: "🇳🇬",
    rwanda_flag: "🇷🇼",
    sao_tome_flag: "🇸🇹",
    senegal_flag: "🇸🇳",
    seychelles_flag: "🇸🇨",
    sierra_leone_flag: "🇸🇱",
    somalia_flag: "🇸🇴",
    south_africa_flag: "🇿🇦",
    south_sudan_flag: "🇸🇸",
    sudan_flag: "🇸🇩",
    tanzania_flag: "🇹🇿",
    togo_flag: "🇹🇬",
    tunisia_flag: "🇹🇳",
    uganda_flag: "🇺🇬",
    zambia_flag: "🇿🇲",
    zimbabwe_flag: "🇿🇼",
    africa_flag: "🌍", france_flag: "🇫🇷", italy_flag: "🇮🇹", japan_flag: "🇯🇵", china_flag: "🇨🇳",
    twitok_cap: "🧢", money_gun: "💸🔫", wedding_rings: "💍", flying_angel: "👼✨",
    luxury_yacht: "🛥️", private_jet: "✈️", luxury_mansion: "🏰", super_car: "🏎️",
    cash_bundle: "💵", money_bag: "💰", gold_bars: "🪙", treasure_chest: "🧰", diamond_vault: "💎",
    money_rain: "💸", golden_tree: "🌳", fortune_dragon: "🐉", fireworks: "🎆", birthday_cake: "🎂",
    champagne: "🥂", confetti: "🎉", love_carriage: "🎠", sky_lantern: "🏮", stage_show: "🎤",
    festival_parade: "🎊", galaxy: "🌌", universe: "🌌✨", heavens_gate: "🚪✨", atlantis: "🏛️",
    phoenix: "🔥🦅", time_castle: "🏰⏳", eternal_love: "💖✨", twitok_legend: "👑✨"
  };
  return icons[animation] ?? "🎁";
}

const giftStyles: Record<string, CSSProperties> = {
  sheet:{position:"fixed",left:"50%",bottom:0,transform:"translateX(-50%)",width:"min(680px,100%)",background:"#111",border:"1px solid #333",borderRadius:"22px 22px 0 0",padding:18,zIndex:1000,boxSizing:"border-box",boxShadow:"0 -10px 40px rgba(0,0,0,.45)"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:18},
  balance:{display:"block",fontSize:13,color:"#aaa",marginTop:5},
  close:{background:"#222",color:"#fff",border:0,borderRadius:20,fontSize:24,width:40,height:40},
  tabs:{display:"flex",gap:8,marginTop:14,overflowX:"auto",paddingBottom:2},
  tab:{background:"#222",color:"#aaa",border:"1px solid #333",borderRadius:999,padding:"8px 13px",fontWeight:700,whiteSpace:"nowrap"},
  tabActive:{background:"#fff",color:"#000",border:"1px solid #fff",borderRadius:999,padding:"8px 13px",fontWeight:800,whiteSpace:"nowrap"},
  grid:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginTop:12,maxHeight:260,overflowY:"auto"},
  gift:{background:"linear-gradient(145deg,#1c1c1c,#101010)",color:"#fff",border:"1px solid #4a4a4a",borderRadius:14,padding:"12px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",boxShadow:"0 4px 18px rgba(0,0,0,.28)"},
  emoji:{fontSize:30},
  emojiLarge:{fontSize:38},
  quantity:{display:"flex",alignItems:"center",gap:8,marginTop:14,color:"#aaa"},
  quantityButton:{background:"#222",color:"#fff",border:"1px solid #333",borderRadius:8,padding:"7px 12px"},
  active:{background:"#fff",color:"#000",border:"1px solid #fff",borderRadius:8,padding:"7px 12px",fontWeight:800},
  buyCoins:{display:"inline-block",marginTop:0,background:"#fff",color:"#000",borderRadius:10,padding:"9px 13px",fontWeight:800,textDecoration:"none",whiteSpace:"nowrap"},
  insufficient:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:12,padding:"10px 12px",background:"#241818",border:"1px solid #5a3030",borderRadius:12,color:"#fff",fontSize:13},
  message:{margin:"12px 0 0",color:"#fff"},
  giftButton:{background:"#ff2d55",color:"#fff",border:0,borderRadius:10,padding:"8px 12px",fontWeight:800},
  burst:{position:"absolute",right:18,bottom:120,zIndex:30,background:"rgba(0,0,0,.72)",borderRadius:20,padding:"8px 14px",display:"flex",alignItems:"center",gap:8,color:"#fff"}
};
