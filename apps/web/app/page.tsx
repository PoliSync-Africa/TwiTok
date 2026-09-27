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
  autoCaptionLanguage?: string;
  captionTracks?: Record<string, { language: string; label: string; url: string; sourceLanguage?: string }>;
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
  const [captionLanguage, setCaptionLanguage] = useState<Record<string, string>>({});
  const [translationBusy, setTranslationBusy] = useState<Record<string, boolean>>({});

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
    document.querySelectorAll<HTMLVideoElement>(".real-video").forEach(video => {
      const selected = video.dataset.captionLanguage ?? "";
      Array.from(video.textTracks).forEach(track => {
        track.mode = selected && track.language === selected ? "showing" : "hidden";
      });
    });
  }, [videos, captionLanguage]);

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
        <button className="sound-toggle" onClick={() => setMuted(v => !v)}>{muted ? "🔇" : "🔊"}</button>
      </header>

      <div className="vertical-feed">
        {videos.map((v, i) => {
          const playback = v.playback?.mp4Url ?? v.playback?.hlsUrl;
          return <article className="video-card" data-video-id={v.id} key={v.id}>
            <div className="video-stage">
              {playback
                ? <video className="real-video" data-caption-language={captionLanguage[v.id] ?? v.autoCaptionLanguage ?? ""} src={playback} poster={v.thumbnail ?? undefined} playsInline loop controls={false} muted={muted} preload={i < 2 ? "auto" : "metadata"} onEnded={() => track(v.id, "VIEW_COMPLETE")}>
                    {v.autoCaptionsUrl && (<><track kind="captions" src={v.autoCaptionsUrl} srcLang={v.autoCaptionLanguage ?? "en"} label="Original captions" />{Object.values(v.captionTracks ?? {}).map(track => <track key={track.language} kind="captions" src={track.url} srcLang={track.language} label={track.label} />)}</>)}
                  </video>
                : <div className={`video-art demo-art-${i % 3}`}><div className="demo-mark">TwiTok</div></div>}
              <div className="gradient"/>
              <div className="video-copy">
                <strong>{v.owner?.username ?? v.ownerUsername ?? "@creator"}{v.country ? ` · ${v.country}` : ""}</strong>
                <h2>{v.caption ?? ""}</h2>
                <p>{(v.hashtags ?? []).map(tag => `#${tag}`).join(" ")}</p>
                  <div className="caption-language"><select value={captionLanguage[v.id] ?? v.autoCaptionLanguage ?? ""} onChange={e => { const lang = e.target.value; if (lang === "__translate__") return; setCaptionLanguage(prev => ({ ...prev, [v.id]: lang })); }}><option value={v.autoCaptionLanguage ?? ""}>Original captions</option>{Object.values(v.captionTracks ?? {}).map(track => <option key={track.language} value={track.language}>{track.label}</option>)}<option value="__translate__" disabled={translationBusy[v.id]}>Translate captions…</option></select><div className="caption-translate-buttons">{["en","fr","tw","ha","yo","ig","sw","ar"].filter(lang => lang !== (v.autoCaptionLanguage ?? "") && !v.captionTracks?.[lang]).map(lang => <button key={lang} type="button" disabled={translationBusy[v.id]} onClick={() => requestTranslation(v.id, lang)}>{translationBusy[v.id] ? "Translating…" : `+${lang.toUpperCase()}`}</button>)}</div></div>\n                {soundMap[v.id] && <Link className="video-sound" href={`/sound/${soundMap[v.id]._id}`}>♪ {soundMap[v.id].title} — {soundMap[v.id].artist}</Link>}
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
