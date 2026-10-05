"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
type Stream = { streamId: string; title: string; status: "SCHEDULED"|"LIVE"|"ENDED"; viewerCount?: number };

export default function LivePage() {
  const [title,setTitle]=useState(""); const [stream,setStream]=useState<Stream|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function request(path:string, init:RequestInit={}) {
    const token=window.localStorage.getItem("twitok_user_token"); if(!token) throw new Error("Sign in to use LIVE.");
    const r=await fetch(API+path,{...init,headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,...(init.headers??{})}});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error??"LIVE request failed."); return d;
  }
  async function create(e:FormEvent){e.preventDefault();if(!title.trim()||busy)return;setBusy(true);setError("");try{const d=await request("/live/streams",{method:"POST",body:JSON.stringify({title:title.trim()})});setStream(d);setTitle("");}catch(e){setError(e instanceof Error?e.message:"Unable to create LIVE.");}finally{setBusy(false);}}
  async function status(next:"LIVE"|"ENDED"){if(!stream||busy)return;setBusy(true);setError("");try{const d=await request("/live/streams/"+encodeURIComponent(stream.streamId)+"/status",{method:"POST",body:JSON.stringify({status:next})});setStream(d);}catch(e){setError(e instanceof Error?e.message:"Unable to update LIVE.");}finally{setBusy(false);}}
  return <main style={{minHeight:"100vh",background:"#000",color:"#fff",padding:24}}><div style={{maxWidth:720,margin:"0 auto"}}>
    <Link href="/" style={{color:"#fff"}}>← Back</Link><h1 style={{fontSize:34,margin:"36px 0 8px"}}>LIVE</h1><p style={{color:"#aaa"}}>Start and manage your TwiTok LIVE session.</p>
    {!stream?<form onSubmit={create} style={{marginTop:28,display:"grid",gap:14}}><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="LIVE title" maxLength={150} style={{padding:16,borderRadius:12,border:"1px solid #333",background:"#171717",color:"#fff"}}/><button type="submit" disabled={busy||!title.trim()} style={{padding:16,border:0,borderRadius:12,background:"#fe2c55",color:"#fff",fontWeight:900}}>{busy?"Creating…":"Create LIVE"}</button></form>
    :<section style={{marginTop:28,padding:24,borderRadius:20,background:"#171717"}}><h2>{stream.title}</h2><p>Status: <strong>{stream.status}</strong></p><p>Viewers: {stream.viewerCount??0}</p><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{stream.status!=="LIVE"&&<button onClick={()=>void status("LIVE")} disabled={busy} style={{padding:14,border:0,borderRadius:12,background:"#fe2c55",color:"#fff",fontWeight:900}}>Start LIVE</button>}{stream.status!=="ENDED"&&<button onClick={()=>void status("ENDED")} disabled={busy} style={{padding:14,border:0,borderRadius:12,background:"#333",color:"#fff",fontWeight:900}}>End LIVE</button>}</div><p style={{color:"#888",marginTop:20}}>Broadcast transport is not yet connected; this page manages the LIVE session state.</p></section>}
    {error&&<p style={{color:"#ff6b81",marginTop:16}}>{error}</p>}
  </div></main>;
}