"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
const API=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
export default function PublicProfilePage(){
 const {username}=useParams<{username:string}>(); const [profile,setProfile]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{(async()=>{try{const token=localStorage.getItem("twitok_user_token");const r=await fetch(API+"/profile/"+encodeURIComponent(String(username)),{headers:token?{Authorization:"Bearer "+token}:{}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Profile unavailable.");setProfile(d.profile);}catch(e){setError(e instanceof Error?e.message:"Profile unavailable.");}})();},[username]);
 if(error)return <main className="app"><section className="feed"><div className="composer-panel"><p>{error}</p><Link href="/">← Back</Link></div></section></main>;
 if(!profile)return <main className="app"><section className="feed"><div className="composer-panel">Loading @{String(username)}…</div></section></main>;
 return <main className="app"><section className="feed" style={{maxWidth:900,margin:"0 auto",width:"100%"}}><header className="top"><Link href="/" style={{color:"#fff",textDecoration:"none"}}>← Back</Link><strong>@{profile.username}</strong><span/></header><div style={{padding:"40px 24px",textAlign:"center"}}>{profile.profilePhotoUrl?<img src={profile.profilePhotoUrl} alt="" style={{width:112,height:112,borderRadius:"50%",objectFit:"cover"}}/>:<div style={{width:112,height:112,borderRadius:"50%",margin:"0 auto",display:"grid",placeItems:"center",background:"#222",fontSize:42}}>{(profile.nickname||profile.username).slice(0,1).toUpperCase()}</div>}<h1>{profile.nickname||profile.username} {profile.isVerified?"✓":""}</h1><p style={{opacity:.7}}>@{profile.username}</p><p>{profile.following} Following · {profile.followers} Followers · {profile.likes} Likes</p>{profile.bio?<p>{profile.bio}</p>:null}</div></section></main>;
}