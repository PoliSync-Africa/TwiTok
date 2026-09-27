"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Sound = { _id: string; title: string; artist: string; durationMs: number; usageCount: number; audioUrl?: string; coverUrl?: string };
type Video = { _id: string; caption?: string; playback?: { hlsUrl?: string; mp4Url?: string }; thumbnail?: { url?: string } };

export default function SoundPage() {
  const params = useParams<{ id: string }>();
  const [sound, setSound] = useState<Sound | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token || !params.id) return setMessage("Sign in to explore this sound.");
    fetch(API + "/music/sounds/" + params.id, { headers: { Authorization: "Bearer " + token } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load sound.");
        setSound(data.sound); setVideos(data.videos || []);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Unable to load sound."));
  }, [params.id]);

  function playSound() {
    if (!sound?.audioUrl) return setMessage("This sound does not have a preview available yet.");
    const audio = new Audio(sound.audioUrl);
    audio.play().then(() => setPlaying(true)).catch(() => setMessage("Unable to play this sound preview."));
    audio.onended = () => setPlaying(false);
  }

  return (
    <main className="sound-page">
      <header className="composer-header"><Link href="/" className="back">← Back</Link><strong>Sound</strong><span className="composer-brand">TwiTok</span></header>
      {sound ? <>
        <section className="sound-hero">
          <div className="sound-art">{sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : "♪"}</div>
          <div><span>SOUND</span><h1>{sound.title}</h1><p>{sound.artist}</p><small>{Math.round(sound.durationMs / 1000)}s · {sound.usageCount.toLocaleString()} uses</small></div>
          <button type="button" className="primary-action" onClick={playSound}>{playing ? "Playing…" : "▶ Preview"}</button>
          <Link href={"/create?soundId=" + sound._id} className="secondary-action">Use this sound</Link>
        </section>
        <h2>Videos using this sound</h2>
        <section className="sound-video-grid">
          {videos.map(video => <article key={video._id} className="sound-video-card">
            {video.playback?.mp4Url ? <video src={video.playback.mp4Url} controls playsInline poster={video.thumbnail?.url} /> : <div className="sound-video-empty">Video processing</div>}
            <p>{video.caption || "TwiTok video"}</p>
          </article>)}
          {videos.length === 0 && <p>No public videos are using this sound yet.</p>}
        </section>
      </> : <p>{message || "Loading sound…"}</p>}
    </main>
  );
}
