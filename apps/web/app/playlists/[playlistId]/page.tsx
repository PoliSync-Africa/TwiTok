"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";

type Video={id:string;caption:string;playback?:{mp4Url?:string;hlsUrl?:string}|null;thumbnail?:string|null};
type Playlist={id:string;title:string;description:string;videos:Video[]};

export default function PlaylistPage(){
 const {playlistId}=useParams<{playlistId:string}>(); const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
 const [playlist,setPlaylist]=useState<Playlist|null>(null);const [error,setError]=useState("");
 useEffect(()=>{if(!playlistId)return;fetch(api+"/playlists/"+encodeURIComponent(playlistId),{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??"Playlist not found");setPlaylist(d.playlist)}).catch(e=>setError(e instanceof Error?e.message:"Playlist not found"))},[api,playlistId]);
 if(error)return <main className="playlist-page"><div className="playlist-panel"><h1>Playlist unavailable</h1><p>{error}</p><Link href="/">Open TwiTok</Link></div></main>;
 if(!playlist)return <main className="playlist-page"><div className="playlist-panel">Loading playlist…</div></main>;
 return <main className="playlist-page"><div className="playlist-panel"><header className="playlist-header"><Link href="/">TwiTok</Link><span>Playlist</span></header><section className="playlist-hero"><h1>{playlist.title}</h1><p>{playlist.description}</p><small>{playlist.videos.length} videos</small></section><div className="playlist-videos">{playlist.videos.map((v,i)=>{const src=v.playback?.mp4Url??v.playback?.hlsUrl;return <article key={v.id}><span className="playlist-number">{i+1}</span>{src?<video src={src} poster={v.thumbnail??undefined} controls playsInline preload="metadata"/>:<div className="playlist-placeholder">TwiTok</div>}<div><Link href={"/video/"+v.id}>{v.caption||"Untitled video"}</Link></div></article>})}</div></div></main>;
}