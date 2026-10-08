"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "../../lib/auth";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Video = { id: string; thumbnail?: string | null; playback?: { mp4Url?: string; hlsUrl?: string } | null; caption?: string };

function Icon({ path, size = 19 }: { path: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tab, setTab] = useState<"videos" | "favorites" | "liked">("videos");
  const [sort, setSort] = useState<"latest"|"popular"|"oldest">("latest");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadVideos(username: string, selectedTab = tab, selectedSort = sort) {
    const token = localStorage.getItem("twitok_user_token");
    const endpoint = selectedTab === "videos" ? "videos" : selectedTab === "favorites" ? "saved" : "liked";
    const r = await fetch(API + "/profile/" + encodeURIComponent(username) + "/" + endpoint, { headers: token ? { Authorization: "Bearer " + token } : {} });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const items = Array.isArray(d.videos) ? d.videos : [];
      const sorted = [...items].sort((a: any,b: any) => {
        if (selectedSort === "oldest") return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
        if (selectedSort === "popular") return Number(b.likeCount ?? b.engagement?.likeCount ?? 0) - Number(a.likeCount ?? a.engagement?.likeCount ?? 0);
        return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      });
      setVideos(sorted);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("twitok_user_token");
        if (!token) throw new Error("SIGN_IN_REQUIRED");
        const me = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + token } });
        const md = await me.json().catch(() => ({}));
        if (!me.ok || !md.user?.username) throw new Error(md.error ?? "Profile setup is incomplete.");
        const username = String(md.user.username);
        const r = await fetch(API + "/profile/" + encodeURIComponent(username), { headers: { Authorization: "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Profile unavailable.");
        setProfile(d.profile);
        await loadVideos(username, "videos", "latest");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profile unavailable.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="profile-page"><div className="profile-card">Loading profile…</div></main>;
  if (error || !profile) return <main className="profile-page"><div className="profile-card"><p>{error === "SIGN_IN_REQUIRED" ? "Sign in to view your profile." : (error || "Profile unavailable.")}</p>{error === "SIGN_IN_REQUIRED" ? <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:14}}><Link href="/register">Sign up</Link><Link href="/login">Sign in</Link></div> : null}<Link href="/">Back to TwiTok</Link></div></main>;

  function selectTab(next: "videos"|"favorites"|"liked") {
    setTab(next);
    void loadVideos(profile.username, next, sort);
  }

  function selectSort(next: "latest"|"popular"|"oldest") {
    setSort(next);
    void loadVideos(profile.username, tab, next);
  }

  return <main className="profile-page">
    <section className="profile-shell">
      <header className="profile-header">
        <Link href="/" className="profile-icon" aria-label="Back"><Icon path="M19 12H5m7 7-7-7 7-7" /></Link>
        <strong>{profile.username}</strong>
        <div className="profile-header-actions">
          <button className="profile-icon" aria-label="Profile settings" onClick={() => { window.location.href="/settings"; }}><Icon path="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2M12 19.5v2M4.58 4.58l1.42 1.42M18 18l1.42 1.42M2 12h2M20 12h2M4.58 19.42 6 18M18 6l1.42-1.42"/></button>
          <button className="profile-icon" aria-label="Share profile" onClick={() => { navigator.clipboard?.writeText(window.location.href); }}><Icon path="M18 8a3 3 0 1 0-2.83-4A3 3 0 0 0 18 8ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.8l6.8-3.6M8.6 13.2l6.8 3.6"/></button>
        </div>
      </header>

      <div className="profile-hero">
        <div className="profile-top">
          <div className="profile-avatar">{profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="" /> : (profile.nickname || profile.username).slice(0,1).toUpperCase()}</div>
          <div className="profile-identity"><h1>{profile.nickname || profile.username}{profile.isVerified ? <span className="verified">✓</span> : null}</h1><p>@{profile.username}</p></div>
        </div>
        <div className="profile-stats"><span><b>{profile.following ?? 0}</b><small>Following</small></span><span><b>{profile.followers ?? 0}</b><small>Followers</small></span><span><b>{profile.likes ?? 0}</b><small>Likes</small></span></div>
        <p className="profile-bio">{profile.bio || "No bio yet."}</p>
        <div className="profile-actions">
          <Link href="/edit-profile" className="profile-primary">Edit profile</Link>
          <Link href="/create?tool=promote" className="profile-secondary">Promote post</Link>
          <Link href="/settings" className="profile-secondary">⚙</Link>
          <button className="profile-secondary" onClick={() => navigator.clipboard?.writeText(window.location.href)} aria-label="Share profile">↗</button>
        </div>
      </div>

      <div className="profile-tabbar">
        <nav className="profile-tabs">
          <button className={tab === "videos" ? "active" : ""} onClick={() => selectTab("videos")}>Posts</button>
          <button className={tab === "favorites" ? "active" : ""} onClick={() => selectTab("favorites")}>Favorites</button>
          <button className={tab === "liked" ? "active" : ""} onClick={() => selectTab("liked")}>Liked</button>
        </nav>
        <div className="profile-sort" aria-label="Sort posts">
          {(["latest","popular","oldest"] as const).map(item => <button key={item} className={sort === item ? "active" : ""} onClick={() => selectSort(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}
        </div>
      </div>

      <div className="profile-grid">
        {videos.map(video => <Link href={"/video/" + encodeURIComponent(video.id)} key={video.id} className="profile-tile">{video.thumbnail ? <img src={video.thumbnail} alt="" /> : <div className="profile-tile-placeholder"><Icon path="M8 5v14l11-7Z" size={28}/></div>}<span>{video.caption || ""}</span></Link>)}
        {!videos.length ? <div className="profile-empty"><div className="profile-empty-icon"><Icon path="M5 4h14v16H5zM9 8h6M9 12h6M9 16h4" size={34}/></div><strong>{tab === "videos" ? "Upload your first video" : tab === "favorites" ? "Favorites" : "Liked"}</strong><p>{tab === "videos" ? "Your videos will appear here" : "Your saved activity will appear here"}</p></div> : null}
      </div>

      <div className="profile-footer-actions">
        <button onClick={() => void signOut().then(() => { window.location.href="/"; })}>Sign out</button>
      </div>
    </section>
  </main>;
}
