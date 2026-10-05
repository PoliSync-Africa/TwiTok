"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
const API=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
export default function ProfilePage(){
 const [profile,setProfile]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{(async()=>{try{const token=localStorage.getItem("twitok_user_token");if(!token)throw new Error("Sign in to view your profile.");const me=await fetch(API+"/auth/me",{headers:{Authorization:"Bearer "+token}});const md=await me.json().catch(()=>({}));if(!me.ok||!md.user?.username)throw new Error(md.error??"Profile setup is incomplete.");const r=await fetch(API+"/profile/"+encodeURIComponent(String(md.user.username)),{headers:{Authorization:"Bearer "+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Profile unavailable.");setProfile(d.profile);}catch(e){setError(e instanceof Error?e.message:"Profile unavailable.");}finally{setLoading(false);}})();},[]);
 if(loading)return <main className="app"><section className="feed"><div className="composer-panel">Loading profile…</div></section></main>;
 if(error||!profile)return <main className="app"><section className="feed"><div className="composer-panel"><h1>Profile</h1><p>{error||"Profile unavailable."}</p><Link href="/">← Back to TwiTok</Link></div></section></main>;
 return <main className="app"><section className="feed" style={{maxWidth:900,margin:"0 auto",width:"100%"}}>
  <header className="top"><Link href="/" style={{color:"#fff",textDecoration:"none"}}>← Back</Link><strong>@{profile.username}</strong><span/></header>
  <div style={{padding:"40px 24px 80px",textAlign:"center"}}>
   {profile.profilePhotoUrl?<img src={profile.profilePhotoUrl} alt="" style={{width:112,height:112,borderRadius:"50%",objectFit:"cover",border:"2px solid #fff"}}/>:<div style={{width:112,height:112,borderRadius:"50%",margin:"0 auto",display:"grid",placeItems:"center",background:"#222",fontSize:42,fontWeight:800}}>{(profile.nickname||profile.username).slice(0,1).toUpperCase()}</div>}
   <h1 style={{margin:"18px 0 4px"}}>{profile.nickname||profile.username} {profile.isVerified?"✓":""}</h1><p style={{opacity:.7}}>@{profile.username}</p>
   <div style={{display:"flex",justifyContent:"center",gap:38,margin:"26px 0"}}><div><b>{profile.following}</b><div>Following</div></div><div><b>{profile.followers}</b><div>Followers</div></div><div><b>{profile.likes}</b><div>Likes</div></div></div>
   {profile.bio?<p style={{maxWidth:520,margin:"0 auto 24px",lineHeight:1.5}}>{profile.bio}</p>:null}
   <Link href="/create" className="primary" style={{display:"inline-block",padding:"12px 24px",borderRadius:10,textDecoration:"none"}}>Create</Link>
  </div>
 </section></main>;
}