"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type FeedVideo = {
  id: string;
  owner?: { username?: string };
  ownerUsername?: string;
  caption?: string;
  hashtags?: string[];
  playback?: { hlsUrl?: string; mp4Url?: string };
  thumbnail?: string | null;
  country?: string;
  autoCaptionsUrl?: string;
  autoCaptionsStatus?: string;
};

const demoVideos: FeedVideo[] = [
  { id: "demo-1", ownerUsername: "@kofi_creates", country: "Ghana", caption: "Accra after sunset 🌍✨", hashtags: ["Ghana","Africa","TwiTok"] },
  { id: "demo-2", ownerUsername: "@amakaofficial", country: "Nigeria", caption: "Our culture, our story.", hashtags: ["Nigeria","Culture","Africa"] },
  { id: "demo-3", ownerUsername: "@zuri_daily", country: "Kenya", caption: "A morning in Nairobi.", hashtags: ["Kenya","Nairobi","TwiTok"] }
];

const tabs = [
  { label: "For You", surface: "FOR_YOU" },
  { label: "Following", surface: "FOLLOWING" },
  { label: "Africa", surface: "AFRICA" }
] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof tabs)[number]["surface"]>("FOR_YOU");
  const [videos, setVideos] = useState<FeedVideo[]>(demoVideos);
  const [muted, setMuted] = useState(true);
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const activeRef = useRef<string | null>(null);
  const [soundMap, setSoundMap] = useState<Record<string, { _id: string; title: string; artist: string }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("twitok_user_token") : null;
      if (!token) return;
      try {
        const response = await fetch(`${api}/feed/${tab}?limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data.items) && data.items.length) setVideos(data.items);
      } catch {}
    }
    load();
    return () => { cancelled = true; };
  }, [api, tab]);

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
        <button className="sound-toggle" onClick={() => setMuted(v => !v)}>{muted ? "🔇" : "🔊"}</button>
      </header>

      <div className="vertical-feed">
        {videos.map((v, i) => {
          const playback = v.playback?.mp4Url ?? v.playback?.hlsUrl;
          return <article className="video-card" data-video-id={v.id} key={v.id}>
            <div className="video-stage">
              {playback
                ? <video className="real-video" src={playback} poster={v.thumbnail ?? undefined} playsInline loop controls={false} muted={muted} preload={i < 2 ? "auto" : "metadata"} onEnded={() => track(v.id, "VIEW_COMPLETE")}>
                    {v.autoCaptionsUrl && <track kind="captions" src={v.autoCaptionsUrl} srcLang="en" label="TwiTok captions" default />}
                  </video>
                : <div className={`video-art demo-art-${i % 3}`}><div className="demo-mark">TwiTok</div></div>}
              <div className="gradient"/>
              <div className="video-copy">
                <strong>{v.owner?.username ?? v.ownerUsername ?? "@creator"}{v.country ? ` · ${v.country}` : ""}</strong>
                <h2>{v.caption ?? ""}</h2>
                <p>{(v.hashtags ?? []).map(tag => `#${tag}`).join(" ")}</p>
                {soundMap[v.id] && <Link className="video-sound" href={`/sound/${soundMap[v.id]._id}`}>♪ {soundMap[v.id].title} — {soundMap[v.id].artist}</Link>}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => track(v.id, "LIKE")}>♡<small>Like</small></button>
              <button onClick={() => track(v.id, "COMMENT")}>◌<small>Comment</small></button>
              <button onClick={() => track(v.id, "SHARE")}>↗<small>Share</small></button>
              <button onClick={() => track(v.id, "SAVE")}>▱<small>Save</small></button>
            </div>
          </article>;
        })}
      </div>
    </section>
  </main>;
}
