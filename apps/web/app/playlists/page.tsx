"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Playlist={id:string;title:string;description:string;visibility:"PUBLIC"|"PRIVATE";videoIds:string[];updatedAt:string};

export default function PlaylistsPage(){
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [token,setToken]=useState<string|null>(null);
  const [items,setItems]=useState<Playlist[]>([]);
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [visibility,setVisibility]=useState<"PUBLIC"|"PRIVATE">("PUBLIC");
  const [selected,setSelected]=useState("");
  const [videoId,setVideoId]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true);

  async function load(){
    const t=window.localStorage.getItem("twitok_user_token"); if(!t)return;
    setToken(t); setLoading(true);
    try{const r=await fetch(api+"/playlists/mine",{headers:{Authorization:"Bearer "+t},cache:"no-store"});const d=await r.json();if(r.ok)setItems(d.playlists??[]);else setMessage(d.error??"Unable to load playlists");}catch{setMessage("Unable to load playlists")}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);

  async function create(e:FormEvent){
    e.preventDefault(); if(!token||!title.trim())return;
    setMessage("");
    try{const r=await fetch(api+"/playlists",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({title,description,visibility})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to create playlist");setItems(v=>[d.playlist,...v]);setTitle("");setDescription("");setMessage("Playlist created");}catch(e){setMessage(e instanceof Error?e.message:"Unable to create playlist")}
  }

  async function addVideo(){
    if(!token||!selected||!videoId.trim())return;
    setMessage("");
    try{const r=await fetch(api+"/playlists/"+encodeURIComponent(selected)+"/videos",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({videoId:videoId.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to add video");setItems(v=>v.map(p=>p.id===selected?d.playlist:p));setVideoId("");setMessage("Video added");}catch(e){setMessage(e instanceof Error?e.message:"Unable to add video")}
  }

  async function removeVideo(playlistId:string,id:string){
    if(!token)return;
    try{const r=await fetch(api+"/playlists/"+encodeURIComponent(playlistId)+"/videos/"+encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer "+token}});const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to remove video");setItems(v=>v.map(p=>p.id===playlistId?d.playlist:p));}catch(e){setMessage(e instanceof Error?e.message:"Unable to remove video")}
  }

  if(!token&&!loading)return <main className="playlist-page"><div className="playlist-panel"><h1>Sign in to manage playlists</h1><Link href="/">Back to TwiTok</Link></div></main>;

  return <main className="playlist-page"><div className="playlist-panel">
    <header className="playlist-header"><Link href="/">TwiTok</Link><span>Creator Playlists</span></header>
    <section className="playlist-manager">
      <div><h1>Your playlists</h1><p>Organize your published videos into public or private collections.</p></div>
      <form className="playlist-create" onSubmit={create}>
        <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80} placeholder="Playlist title" required/>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={300} placeholder="Description (optional)"/>
        <select value={visibility} onChange={e=>setVisibility(e.target.value as "PUBLIC"|"PRIVATE")}><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option></select>
        <button type="submit">Create playlist</button>
      </form>
      {message&&<p className="playlist-message">{message}</p>}
      {loading?<p>Loading…</p>:items.length===0?<p>No playlists yet.</p>:<div className="playlist-manager-grid">{items.map(p=><article className="playlist-manager-card" key={p.id}>
        <div><Link href={"/playlists/"+p.id}><h2>{p.title}</h2></Link><p>{p.description||"No description"}</p><small>{p.videoIds.length} videos · {p.visibility.toLowerCase()}</small></div>
        <div className="playlist-add"><button type="button" onClick={()=>setSelected(p.id)}>Manage videos</button>{selected===p.id&&<div><input value={videoId} onChange={e=>setVideoId(e.target.value)} placeholder="Published video ID"/><button type="button" onClick={addVideo}>Add video</button>{p.videoIds.length>0&&<ul>{p.videoIds.map(id=><li key={id}><code>{id}</code><button type="button" onClick={()=>removeVideo(p.id,id)}>Remove</button></li>)}</ul>}</div>}</div>
      </article>)}</div>}
    </section>
  </div></main>;
}
