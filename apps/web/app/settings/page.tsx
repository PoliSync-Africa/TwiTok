"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut, type TwiTokUser } from "../../lib/auth";

export default function SettingsPage() {
  const [user,setUser]=useState<TwiTokUser|null>(null);
  useEffect(()=>{void getCurrentUser().then(setUser)},[]);
  return <main className="settings-page"><section className="settings-shell">
    <header className="settings-header"><Link href="/">←</Link><div><h1>Settings and privacy</h1><p>Manage your TwiTok account, privacy and security.</p></div></header>
    <section className="settings-section"><h2>Account</h2>
      <Link href="/profile" className="settings-row"><span>Profile</span><small>{user?.username ? "@"+user.username : "Set up your profile"} →</small></Link>
      <Link href="/profile-setup" className="settings-row"><span>Username and profile</span><small>Manage →</small></Link>
      <Link href="/settings/security" className="settings-row"><span>Security</span><small>Password, devices and login security →</small></Link>
    </section>
    <section className="settings-section"><h2>Privacy and safety</h2>
      <button className="settings-row"><span>Privacy</span><small>Private account, interactions and discoverability →</small></button>
      <button className="settings-row"><span>Notifications</span><small>Push, email and activity alerts →</small></button>
      <button className="settings-row"><span>Content preferences</span><small>Topics, keyword filters and feed controls →</small></button>
      <button className="settings-row"><span>Screen time and wellbeing</span><small>Usage and teen safety controls →</small></button>
    </section>
    <section className="settings-section"><h2>Creator</h2>
      <Link href="/studio" className="settings-row"><span>Creator Studio</span><small>Content and analytics →</small></Link>
      <Link href="/live" className="settings-row"><span>LIVE</span><small>Host and moderation tools →</small></Link>
      <Link href="/messages" className="settings-row"><span>Inbox</span><small>Messages and activity →</small></Link>
    </section>
    <section className="settings-section danger"><h2>Account access</h2>
      <button className="signout" onClick={()=>void signOut().then(()=>{window.location.href="/"})}>Sign out</button>
      <button className="delete">Deactivate or delete account</button>
    </section>
  </section></main>;
}
