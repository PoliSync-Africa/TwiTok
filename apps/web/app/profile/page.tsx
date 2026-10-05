"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

type Video = { id: string; thumbnail?: string | null; playback?: { mp4Url?: string; hlsUrl?: string } | null; caption?: string };

function Icon({ path, size = 19 }: { path: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tab, setTab] = useState<"videos" | "reposts" | "liked" | "saved">("videos");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadVideos(username: string, selectedTab = tab) {
    const token = localStorage.getItem("twitok_user_token");
    const endpoint = selectedTab === "videos" ? "videos" : selectedTab;
    const r = await fetch(API + "/profile/" + encodeURIComponent(username) + "/" + endpoint, { headers: token ? { Authorization: "Bearer " + token } : {} });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setVideos(d.videos ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("twitok_user_token");
        if (!token) throw new Error("Sign in to view your profile.");
        const me = await fetch(API + "/auth/me", { headers: { Authorization: "Bearer " + token } });
        const md = await me.json().catch(() => ({}));
        if (!me.ok || !md.user?.username) throw new Error(md.error ?? "Profile setup is incomplete.");
        const username = String(md.user.username);
        const r = await fetch(API + "/profile/" + encodeURIComponent(username), { headers: { Authorization: "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Profile unavailable.");
        setProfile(d.profile);
        await loadVideos(username, "videos");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profile unavailable.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="profile-page"><div className="profile-card">Loading profile…</div></main>;
  if (error || !profile) return <main className="profile-page"><div className="profile-card"><p>{error || "Profile unavailable."}</p><Link href="/">Back to TwiTok</Link></div></main>;

  return <main className="profile-page">
    <section className="profile-shell">
      <header className="profile-header"><Link href="/" className="profile-icon"><Icon path="M19 12H5m7 7-7-7 7-7" /></Link><strong>@{profile.username}</strong><div className="profile-header-actions"><Link href="/settings" className="profile-icon"><Icon path="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m7.07-9.5 1.73-1m-15.6 9 1.73-1m12.14-5.5 1.73 1M3.93 6l1.73 1"/></Link></div></header>
      <div className="profile-hero">
        <div className="profile-top">
          <div className="profile-avatar">{profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="" /> : (profile.nickname || profile.username).slice(0,1).toUpperCase()}</div>
          <div className="profile-identity"><h1>{profile.nickname || profile.username}{profile.isVerified ? <span className="verified">✓</span> : null}</h1><p>@{profile.username}</p></div>
        </div>
        <div className="profile-stats"><span><b>{profile.following}</b><small>Following</small></span><span><b>{profile.followers}</b><small>Followers</small></span><span><b>{profile.likes}</b><small>Likes</small></span></div>
        {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
        <div className="profile-actions"><Link href="/edit-profile" className="profile-primary">Edit profile</Link><Link href="/create" className="profile-secondary">Create</Link><button className="profile-secondary" onClick={() => { navigator.clipboard?.writeText(window.location.href); }}>Share</button></div>
      </div>
      <nav className="profile-tabs">
        {(["videos","reposts","liked","saved"] as const).map(key => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); void loadVideos(profile.username, key); }}>{key === "videos" ? "Posts" : key[0].toUpperCase() + key.slice(1)}</button>)}
      </nav>
      <div className="profile-grid">
        {videos.map(video => <Link href={"/video/" + encodeURIComponent(video.id)} key={video.id} className="profile-tile">{video.thumbnail ? <img src={video.thumbnail} alt="" /> : <div className="profile-tile-placeholder"><Icon path="M8 5v14l11-7Z" size={28}/></div>}<span>{video.caption || ""}</span></Link>)}
        {!videos.length ? <div className="profile-empty"><Icon path="M4 6h16v12H4zM8 10l2.5 2.5L13 10l5 5" size={34}/><p>No posts yet.</p></div> : null}
      </div>
    </section>
  </main>;
}
