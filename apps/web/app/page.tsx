"use client";

import { useState } from "react";
import Link from "next/link";

const tabs = ["For You", "Following", "Africa"];
const videos = [
  { creator: "@kofi_creates", country: "Ghana", title: "Accra after sunset 🌍✨", tags: "#Ghana #Africa #TwiTok", stat: "1.2M" },
  { creator: "@amakaofficial", country: "Nigeria", title: "Our culture, our story.", tags: "#Nigeria #Culture #Africa", stat: "842K" },
  { creator: "@zuri_daily", country: "Kenya", title: "A morning in Nairobi.", tags: "#Kenya #Nairobi #TwiTok", stat: "615K" }
];

export default function Home() {
  const [tab, setTab] = useState("For You");
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
      <div className="rail-bottom"><button>＋ Create</button><small>Africa's Video Platform</small></div>
    </aside>
    <section className="feed">
      <header className="top"><div className="mobile-logo">TwiTok</div><div className="tabs">{tabs.map(t=><button key={t} className={tab===t?"selected":""} onClick={()=>setTab(t)}>{t}</button>)}</div><div className="search">⌕ Search</div></header>
      {videos.map((v,i)=><article className="video-card" key={v.creator}>
        <div className="video-art" data-index={i}><div className="play">▶</div><div className="video-copy"><strong>{v.creator} · {v.country}</strong><h2>{v.title}</h2><p>{v.tags}</p></div></div>
        <div className="actions"><button>♡<small>Like</small></button><button>◌<small>Comment</small></button><button>↗<small>Share</small></button><button>▱<small>Save</small></button></div>
      </article>)}
    </section>
  </main>;
}