"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const API =
  process.env.NEXT_PUBLIC_TWITOK_API_URL ??
  "https://twitok-api-sfig.onrender.com/api/v1";

type Sound = {
  _id: string;
  title: string;
  artist: string;
  durationMs: number;
  usageCount: number;
  audioUrl?: string;
  coverUrl?: string;
  type?: string;
};

type Filter = "Suggested" | "Mood" | "Genre" | "Starred";

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function coverLabel(sound: Sound) {
  const text = `${sound.title} ${sound.artist}`.toLowerCase();
  if (text.includes("daddy") || text.includes("lumba")) return "DL";
  if (text.includes("sarkodie")) return "SK";
  if (text.includes("kofi")) return "KK";
  if (text.includes("jane") || text.includes("bernice")) return "JB";
  return "♪";
}

export default function SoundLibraryPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Suggested");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [starred, setStarred] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("twitok_starred_sounds") ?? "[]");
      if (Array.isArray(saved)) setStarred(saved.filter((x): x is string => typeof x === "string"));
    } catch {
      setStarred([]);
    }
  }, []);

  async function loadSounds(q = "") {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) {
      window.location.href = "/auth-required?next=/sound";
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());

      const response = await fetch(API + "/music/sounds?" + params.toString(), {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load sounds.");
      setSounds(Array.isArray(data.sounds) ? data.sounds : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load sounds.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSounds();
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setFilter("Suggested");
    void loadSounds(query);
  }

  function toggleStar(soundId: string) {
    setStarred(current => {
      const next = current.includes(soundId)
        ? current.filter(id => id !== soundId)
        : [...current, soundId];
      window.localStorage.setItem("twitok_starred_sounds", JSON.stringify(next));
      return next;
    });
  }

  async function togglePlay(sound: Sound) {
    if (!sound.audioUrl) {
      setMessage("This sound does not have a preview available yet.");
      return;
    }

    if (!audioRef.current) audioRef.current = new Audio();

    const audio = audioRef.current;
    if (playingId === sound._id) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.pause();
    audio.src = sound.audioUrl;
    audio.currentTime = 0;
    audio.onended = () => setPlayingId(null);

    try {
      await audio.play();
      setPlayingId(sound._id);
    } catch {
      setMessage("Unable to play this sound preview.");
      setPlayingId(null);
    }
  }

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const visibleSounds = useMemo(() => {
    if (filter === "Starred") return sounds.filter(sound => starred.includes(sound._id));
    return [...sounds].sort((a, b) => {
      if (filter === "Suggested") return b.usageCount - a.usageCount;
      if (filter === "Mood") return a.title.localeCompare(b.title);
      return a.artist.localeCompare(b.artist);
    });
  }, [filter, sounds, starred]);

  const featured = visibleSounds.length
    ? visibleSounds[featuredIndex % visibleSounds.length]
    : null;

  useEffect(() => {
    setFeaturedIndex(0);
  }, [filter, submittedQuery, sounds.length]);

  return (
    <main className="sound-library-page">
      <header className="sound-library-header">
        <Link href="/create" className="sound-back" aria-label="Back to create">‹</Link>
        <strong>Sound</strong>
        <Link href="/create" className="sound-create-link">Create</Link>
      </header>

      <section className="sound-library-shell">
        <form className="sound-library-search" onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search songs or artists"
            aria-label="Search songs or artists"
          />
          {query && (
            <button type="button" className="sound-clear" onClick={() => { setQuery(""); setSubmittedQuery(""); void loadSounds(); }}>
              ×
            </button>
          )}
        </form>

        <nav className="sound-filters" aria-label="Sound filters">
          {(["Suggested", "Mood", "Genre", "Starred"] as Filter[]).map(item => (
            <button
              key={item}
              type="button"
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        {submittedQuery && !loading && (
          <div className="sound-result-label">
            Results for <b>“{submittedQuery}”</b>
          </div>
        )}

        {featured && (
          <section className="sound-featured">
            <div className="sound-featured-art">
              {featured.coverUrl ? <img src={featured.coverUrl} alt="" /> : <span>{coverLabel(featured)}</span>}
              <button type="button" onClick={() => void togglePlay(featured)} aria-label={playingId === featured._id ? "Pause preview" : "Play preview"}>
                {playingId === featured._id ? "Ⅱ" : "▶"}
              </button>
              <button
                type="button"
                className={starred.includes(featured._id) ? "featured-star active" : "featured-star"}
                onClick={() => toggleStar(featured._id)}
                aria-label={starred.includes(featured._id) ? "Unstar sound" : "Star sound"}
              >
                {starred.includes(featured._id) ? "★" : "☆"}
              </button>
            </div>
            <div className="sound-featured-copy">
              <small>FEATURED SOUND</small>
              <h1>{featured.title}</h1>
              <p>{featured.artist}</p>
              <span>{formatDuration(featured.durationMs)} · {featured.usageCount.toLocaleString()} uses</span>
            </div>
            <Link href={"/sound/" + featured._id} className="sound-use-button">Use</Link>
          </section>
        )}

        <div className="sound-carousel-dots" aria-hidden="true">
          {(visibleSounds.length ? visibleSounds.slice(0, Math.min(4, visibleSounds.length)) : [null]).map((_, index) => (
            <button
              type="button"
              key={index}
              className={index === featuredIndex % Math.max(1, Math.min(4, visibleSounds.length)) ? "active" : ""}
              onClick={() => setFeaturedIndex(index)}
              aria-label={"Featured sound " + (index + 1)}
            />
          ))}
        </div>

        <section className="sound-list">
          {loading && <div className="sound-state">Loading sounds…</div>}
          {!loading && !message && visibleSounds.length === 0 && (
            <div className="sound-state">
              <strong>{filter === "Starred" ? "No starred sounds yet" : "No sounds found"}</strong>
              <span>{filter === "Starred" ? "Tap ☆ beside a sound to save it here." : "Try another song title or artist."}</span>
            </div>
          )}

          {visibleSounds.map(sound => (
            <article className="sound-row-card" key={sound._id}>
              <button type="button" className="sound-row-play" onClick={() => void togglePlay(sound)} aria-label={playingId === sound._id ? "Pause preview" : "Play preview"}>
                {playingId === sound._id ? "Ⅱ" : "▶"}
              </button>

              <div className="sound-row-art">
                {sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : <span>{coverLabel(sound)}</span>}
              </div>

              <Link href={"/sound/" + sound._id} className="sound-row-info">
                <b>{sound.title}</b>
                <span>{sound.artist}</span>
              </Link>

              <span className="sound-row-duration">{formatDuration(sound.durationMs)}</span>

              <button
                type="button"
                className={starred.includes(sound._id) ? "sound-star active" : "sound-star"}
                onClick={() => toggleStar(sound._id)}
                aria-label={starred.includes(sound._id) ? "Unstar sound" : "Star sound"}
              >
                {starred.includes(sound._id) ? "★" : "☆"}
              </button>

              <Link href={"/sound/" + sound._id} className="sound-row-arrow" aria-label={"Open " + sound.title}>
                ›
              </Link>
            </article>
          ))}
        </section>

        {message && <p className="sound-library-message">{message}</p>}

        <p className="sound-rights-note">
          Sounds available on TwiTok are limited to music and audio that TwiTok is authorized to provide for use.
        </p>
      </section>
    </main>
  );
}
