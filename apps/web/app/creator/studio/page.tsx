"use client";

import { useState } from "react";
import Link from "next/link";

const metrics = [
  ["Video views","12.8M","+18.4%"],
  ["Watch time","1,842h","+24.1%"],
  ["Followers","248.6K","+12.7K"],
  ["Estimated earnings","$8,426.50","+31.2%"]
];

export default function CreatorStudio() {
  const [range,setRange]=useState("28 days");
  return <main className="studio">
    <header className="studio-top"><div><Link href="/" className="back">← TwiTok</Link><h1>Creator Studio</h1><p>Creation, analytics and monetization in one professional workspace.</p></div><button className="primary">＋ Create</button></header>
    <div className="studio-nav">{["Overview","Content","Create","Analytics","Audience","Monetization","LIVE","Brand deals","Wallet"].map(x=><button key={x} className={x==="Overview"?"active":""}>{x}</button>)}</div>
    <section className="metrics">{metrics.map(m=><article key={m[0]}><span>{m[0]}</span><strong>{m[1]}</strong><small>{m[2]}</small></article>)}</section>
    <section className="studio-grid">
      <article className="studio-panel chart"><div className="panel-head"><div><span>PERFORMANCE</span><h2>Content performance</h2></div><select value={range} onChange={e=>setRange(e.target.value)}><option>7 days</option><option>28 days</option><option>60 days</option><option>90 days</option></select></div><div className="bars">{[42,61,54,78,67,91,74,83,96,72,88,100].map((n,i)=><i key={i} style={{height:n+"%"}} />)}</div></article>
      <article className="studio-panel"><span>MONETIZATION</span><h2>Programs</h2><div className="program"><b>Creator Rewards</b><em>Eligible</em></div><div className="program"><b>LIVE Gifts</b><em>Eligible</em></div><div className="program"><b>Video Gifts</b><em>Eligible</em></div><div className="program"><b>Creator Marketplace</b><em>Eligible</em></div><div className="program"><b>Affiliate Commerce</b><em>Set up</em></div></article>
      <article className="studio-panel wide"><span>CONTENT</span><h2>Recent videos</h2><div className="content-row"><b>Accra after sunset</b><span>2.4M views</span><span>8.7% completion</span><strong>$1,284.40</strong></div><div className="content-row"><b>Our culture, our story</b><span>1.8M views</span><span>10.2% completion</span><strong>$926.80</strong></div><div className="content-row"><b>Morning in Nairobi</b><span>1.1M views</span><span>12.4% completion</span><strong>$641.20</strong></div></article>
      <article className="studio-panel"><span>WALLET</span><h2>$8,426.50</h2><p>Available USD balance</p><button className="primary full">Withdraw</button></article>
    </section>
  </main>;
}