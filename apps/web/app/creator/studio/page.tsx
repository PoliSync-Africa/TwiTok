"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Playlist={id:string;title:string;description:string;visibility:string;videoIds:string[]};

const metrics=[["Video views","12.8M","+18.4%"],["Watch time","1,842h","+24.1%"],["Followers","248.6K","+12.7K"],["Estimated earnings","$8,426.50","+31.2%"]];

export default function CreatorStudio(){
 const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
 const [range,setRange]=useState("28 days"); const [playlists,setPlaylists]=useState<Playlist[]>([]); const [title,setTitle]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 const token=typeof window!=="undefined"?window.localStorage.getItem("twitok_user_token"):"";
 const load=async()=>{if(!token)return;const r=await fetch(api+"/playlists/mine",{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(r.ok){const d=await r.json();setPlaylists(d.playlists??[])}};
 useEffect(()=>{load()},[api,token]);
 const create=async()=>{if(!title.trim()||!token)return;setBusy(true);setMessage("");try{const r=await fetch(api+"/playlists",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({title})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to create playlist");setTitle("");setMessage("Playlist created");await load()}catch(e){setMessage(e instanceof Error?e.message:"Unable to create playlist")}finally{setBusy(false)}};
 return <main className="studio">
  <header className="studio-top"><div><Link href="/" className="back">← TwiTok</Link><h1>Creator Studio</h1><p>Creation, analytics and monetization in one professional workspace.</p></div><Link href="/create" className="primary">＋ Create</Link></header>
  <div className="studio-nav"><button className="active">Overview</button><button>Content</button><Link href="/create">Create</Link><Link href="/creator/analytics">Analytics</Link><button>Audience</button><button>Monetization</button><button>LIVE</button><button>Brand deals</button><Link href="/creator/wallet">Wallet</Link><Link href="/verification">Verification</Link></div>
  <section className="metrics">{metrics.map(m=><article key={m[0]}><span>{m[0]}</span><strong>{m[1]}</strong><small>{m[2]}</small></article>)}</section>
  <section className="studio-grid">
   <article className="studio-panel chart"><div className="panel-head"><div><span>PERFORMANCE</span><h2>Content performance</h2></div><select value={range} onChange={e=>setRange(e.target.value)}><option>7 days</option><option>28 days</option><option>60 days</option><option>90 days</option></select></div><div className="bars">{[42,61,54,78,67,91,74,83,96,72,88,100].map((n,i)=><i key={i} style={{height:n+"%"}} />)}</div></article>
   <article className="studio-panel"><span>MONETIZATION</span><h2>Programs</h2>{["Creator Rewards","LIVE Gifts","Video Gifts","Creator Marketplace","Affiliate Commerce"].map(x=><div className="program" key={x}><b>{x}</b><em>{x==="Affiliate Commerce"?"Set up":"Eligible"}</em></div>)}</article>
   <article className="studio-panel wide"><span>CONTENT PLAYLISTS</span><h2>Creator playlists</h2><p>Group your published videos into ordered collections for viewers.</p><div className="playlist-create"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Playlist title" maxLength={80}/><button className="primary" disabled={busy||!title.trim()} onClick={create}>Create</button></div>{message&&<p className="playlist-message">{message}</p>}<div className="playlist-list">{playlists.length?playlists.map(p=><Link href={"/playlists/"+p.id} className="playlist-card" key={p.id}><strong>{p.title}</strong><span>{p.videoIds.length} videos · {p.visibility.toLowerCase()}</span></Link>):<span className="playlist-empty">No playlists yet.</span>}</div></article>
   <article className="studio-panel"><span>WALLET</span><h2>$8,426.50</h2><p>Available USD balance</p><button className="primary full">Withdraw</button></article>
  </section>
 </main>;
}