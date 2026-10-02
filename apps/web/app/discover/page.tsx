"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UserResult = { id: string; username: string; nickname: string; avatarUrl?: string | null };
type VideoResult = { id: string; ownerId: string; caption: string; hashtags: string[]; playback?: { mp4Url?: string; hlsUrl?: string } | null; thumbnail?: string | null };

export default function DiscoverPage() {
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setUsers([]); setVideos([]); setSearched(false); return; }
    const timer = window.setTimeout(async () => {
      const token = window.localStorage.getItem("twitok_user_token");
      if (!token) return;
      setBusy(true);
      try {
        const response = await fetch(api + "/search?q=" + encodeURIComponent(q) + "&limit=20", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          setUsers(Array.isArray(data.users) ? data.users : []);
          setVideos(Array.isArray(data.videos) ? data.videos : []);
          setSearched(true);
        }
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, api]);

  return <main className="discover-page">
    <header className="discover-header"><Link href="/">←</Link><h1>Discover</h1></header>
    <div className="discover-search"><span>⌕</span><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search creators, videos or hashtags" aria-label="Search TwiTok" /><kbd>⌘ K</kbd></div>
    {busy && <p className="discover-state">Searching…</p>}
    {!busy && searched && !users.length && !videos.length && <p className="discover-state">No results for “{query}”.</p>}
    {!searched && <section className="discover-welcome"><h2>Explore TwiTok</h2><p>Search creators, videos and hashtags from across Africa.</p></section>}
    {!!users.length && <section><h2 className="discover-title">Creators</h2><div className="creator-results">{users.map(user => <article className="creator-result" key={user.id}><div className="creator-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user.username || "U").slice(0,1).toUpperCase()}</div><div><strong>@{user.username}</strong><small>{user.nickname || "TwiTok creator"}</small></div></article>)}</div></section>}
    {!!videos.length && <section><h2 className="discover-title">Videos</h2><div className="discover-grid">{videos.map(video => <article className="discover-video" key={video.id}><Link href={"/video/" + video.id}>{video.playback?.mp4Url || video.playback?.hlsUrl ? <video src={video.playback.mp4Url ?? video.playback.hlsUrl} poster={video.thumbnail ?? undefined} muted playsInline preload="metadata" /> : <div className="discover-placeholder">TwiTok</div>}<div><p>{video.caption}</p><small>{video.hashtags.map(tag => "#" + tag).join(" ")}</small></div></Link></article>)}</div></section>}
  </main>;
}
