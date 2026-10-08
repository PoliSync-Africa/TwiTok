"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type VideoResult = { id: string; caption: string; hashtags: string[]; playback?: { mp4Url?: string; hlsUrl?: string } | null; thumbnail?: string | null; publishedAt?: string | null };

const filters = ["all","ranking","latest","rural","urban","survival","revenge","celebrities","second chance","lucky baby","within 7 days","within 30 days"];

export default function ShortDramasPage() {
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const [filter, setFilter] = useState("all");
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      const query = filter === "all" || filter === "ranking" || filter === "latest" || filter.startsWith("within ") ? "drama" : filter;
      try {
        const token = window.localStorage.getItem("twitok_user_token");
        if (!token) return;
        const response = await fetch(api + "/search?q=" + encodeURIComponent(query) + "&limit=50", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setVideos(Array.isArray(data.videos) ? data.videos : []);
      } finally { if (!cancelled) setBusy(false); }
    }, 100);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, filter]);

  const visible = useMemo(() => {
    const now = Date.now();
    const result = [...videos];
    if (filter === "latest") result.sort((a,b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
    if (filter === "within 7 days" || filter === "within 30 days") {
      const days = filter === "within 7 days" ? 7 : 30;
      return result.filter(v => {
        const published = Date.parse(v.publishedAt ?? "");
        return Number.isFinite(published) && now - published <= days * 86400000;
      });
    }
    return result;
  }, [videos, filter]);

  return <main className="drama-page">
    <header className="drama-header"><Link href="/">←</Link><div><h1>Short dramas</h1><p>Discover real TwiTok stories and series.</p></div></header>
    <nav className="drama-filters" aria-label="Short drama filters">{filters.map(item => <button key={item} type="button" className={filter===item?"active":""} onClick={() => setFilter(item)}>{item}</button>)}</nav>
    {busy && <p className="drama-state">Loading real TwiTok content…</p>}
    {!busy && !visible.length && <div className="drama-empty"><strong>No short-drama posts match this filter.</strong><span>Only published TwiTok content is shown; nothing is fabricated.</span></div>}
    <section className="drama-grid">{visible.map(video => <article key={video.id} className="drama-card"><Link href={"/video/"+video.id}>{video.playback?.mp4Url || video.playback?.hlsUrl ? <video src={video.playback.mp4Url ?? video.playback.hlsUrl} poster={video.thumbnail ?? undefined} muted playsInline preload="metadata" /> : <div className="drama-placeholder">TwiTok</div>}<div><strong>{video.caption || "Untitled drama"}</strong><small>{video.hashtags.map(tag => "#"+tag).join(" ")}</small>{video.publishedAt && <time>{new Date(video.publishedAt).toLocaleDateString()}</time>}</div></Link></article>)}</section>
  </main>;
}
