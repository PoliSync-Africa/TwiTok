"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Video = { id: string; thumbnail?: string | null; caption?: string };

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<"videos" | "reposts">("videos");
  const [error, setError] = useState("");

  async function loadVideos(selected: "videos" | "reposts" = tab) {
    const token = localStorage.getItem("twitok_user_token");
    const r = await fetch(API + "/profile/" + encodeURIComponent(String(username)) + "/" + selected, { headers: token ? { Authorization: "Bearer " + token } : {} });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setVideos(d.videos ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("twitok_user_token");
        const r = await fetch(API + "/profile/" + encodeURIComponent(String(username)), { headers: token ? { Authorization: "Bearer " + token } : {} });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Profile unavailable.");
        setProfile(d.profile);
        setFollowing(Boolean(d.profile?.isFollowing));
        await loadVideos("videos");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profile unavailable.");
      }
    })();
  }, [username]);

  async function toggleFollow() {
    const token = localStorage.getItem("twitok_user_token");
    if (!token || pending) return;
    setPending(true);
    try {
      const r = await fetch(API + "/profile/" + encodeURIComponent(String(username)) + "/follow", { method: following ? "DELETE" : "POST", headers: { Authorization: "Bearer " + token } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Unable to update follow");
      setFollowing(Boolean(d.following));
      setProfile((p: any) => p ? { ...p, followers: Math.max(0, Number(p.followers || 0) + (d.following ? 1 : -1)) } : p);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update follow"); }
    finally { setPending(false); }
  }

  if (error) return <main className="profile-page"><div className="profile-card"><p>{error}</p><Link href="/">Back</Link></div></main>;
  if (!profile) return <main className="profile-page"><div className="profile-card">Loading @{String(username)}…</div></main>;

  return <main className="profile-page">
    <section className="profile-shell">
      <header className="profile-header"><Link href="/" className="profile-icon">←</Link><strong>@{profile.username}</strong><button className="profile-icon" aria-label="More">•••</button></header>
      <div className="profile-hero">
        <div className="profile-top"><div className="profile-avatar">{profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="" /> : (profile.nickname || profile.username).slice(0,1).toUpperCase()}</div><div className="profile-identity"><h1>{profile.nickname || profile.username}{profile.isVerified ? <span className="verified">✓</span> : null}</h1><p>@{profile.username}</p></div></div>
        <div className="profile-stats"><span><b>{profile.following}</b><small>Following</small></span><span><b>{profile.followers}</b><small>Followers</small></span><span><b>{profile.likes}</b><small>Likes</small></span></div>
        {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
        <div className="profile-actions"><button className="profile-primary" onClick={() => void toggleFollow()} disabled={pending}>{pending ? "…" : following ? "Following" : profile.followPending ? "Requested" : "Follow"}</button><Link href={"/messages?username=" + encodeURIComponent(profile.username)} className="profile-secondary">Message</Link><button className="profile-secondary" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Share</button></div>
      </div>
      <nav className="profile-tabs">{(["videos","reposts"] as const).map(key => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); void loadVideos(key); }}>{key === "videos" ? "Posts" : "Reposts"}</button>)}</nav>
      <div className="profile-grid">{videos.map(v => <Link key={v.id} href={"/video/" + encodeURIComponent(v.id)} className="profile-tile">{v.thumbnail ? <img src={v.thumbnail} alt="" /> : <div className="profile-tile-placeholder">▶</div>}<span>{v.caption || ""}</span></Link>)}{!videos.length ? <div className="profile-empty"><p>No posts yet.</p></div> : null}</div>
    </section>
  </main>;
}
