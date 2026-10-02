"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Video = {
  id: string; caption: string; hashtags: string[];
  playback?: { hlsUrl?: string; mp4Url?: string } | null;
  thumbnail?: string | null; owner?: { id: string; username: string; nickname?: string };
};

export default function SharedVideoPage() {
  const params = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState("");
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

  useEffect(() => {
    const id = String(params?.videoId ?? "");
    if (!id) return;
    fetch(api + "/video/public/" + encodeURIComponent(id), { cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Video not found");
        setVideo(data.video);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load video"));
  }, [api, params]);

  if (error) return <main className="shared-video-page"><div className="shared-video-panel"><h1>Video unavailable</h1><p>{error}</p><Link href="/">Open TwiTok</Link></div></main>;
  if (!video) return <main className="shared-video-page"><div className="shared-video-panel"><p>Loading video…</p></div></main>;

  const playback = video.playback?.mp4Url ?? video.playback?.hlsUrl;
  return <main className="shared-video-page"><div className="shared-video-panel">
    <header className="shared-video-header"><Link href="/" className="shared-video-logo">TwiTok</Link><Link href="/" className="shared-video-open">Open app</Link></header>
    <div className="shared-video-stage">{playback ? <video controls playsInline poster={video.thumbnail ?? undefined} src={playback} /> : <div className="shared-video-empty">Video playback is not available yet.</div>}</div>
    <section className="shared-video-meta"><strong>@{video.owner?.username ?? "creator"}</strong><p>{video.caption}</p>{video.hashtags.length > 0 && <div className="shared-video-tags">{video.hashtags.map(tag => <span key={tag}>#{tag}</span>)}</div>}</section>
  </div></main>;
}
