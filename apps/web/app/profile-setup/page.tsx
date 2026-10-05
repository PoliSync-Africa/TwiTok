"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function ProfileSetupPage() {
  const router=useRouter();
  const [username,setUsername]=useState(""); const [nickname,setNickname]=useState(""); const [bio,setBio]=useState(""); const [isPrivate,setIsPrivate]=useState(false); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();const token=localStorage.getItem("twitok_user_token");if(!token){router.replace("/login");return}setBusy(true);setError("");try{const r=await fetch(API+"/auth/profile-setup",{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({username:username.trim().toLowerCase(),nickname:nickname.trim(),bio:bio.trim(),isPrivate})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Unable to complete profile setup");router.replace("/")}catch(e){setError(e instanceof Error?e.message:"Unable to complete profile setup")}finally{setBusy(false)}}
  return <main style={styles.page}><form onSubmit={submit} style={styles.card}><Link href="/" style={styles.back}>TwiTok</Link><h1>Set up your profile</h1><p style={styles.muted}>Choose your unique username before you start using TwiTok.</p><input required minLength={3} maxLength={24} value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g,""))} style={styles.input} placeholder="Username"/><input required maxLength={50} value={nickname} onChange={e=>setNickname(e.target.value)} style={styles.input} placeholder="Display name"/><textarea maxLength={80} value={bio} onChange={e=>setBio(e.target.value)} style={{...styles.input,minHeight:100,resize:"vertical"}} placeholder="Bio (optional)"/><label style={styles.check}><input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)}/> Private account</label>{error?<p style={styles.error}>{error}</p>:null}<button disabled={busy} style={styles.primary}>{busy?"Saving…":"Finish profile"}</button></form></main>;
}
const styles:Record<string,import("react").CSSProperties>={page:{minHeight:"100vh",background:"#000",color:"#fff",display:"grid",placeItems:"center",padding:24},card:{width:"100%",maxWidth:460,background:"#111",border:"1px solid #292929",borderRadius:24,padding:32},back:{color:"#25f4ee",textDecoration:"none"},muted:{color:"#999",lineHeight:1.6},input:{width:"100%",boxSizing:"border-box",marginTop:10,padding:"14px 15px",borderRadius:12,border:"1px solid #333",background:"#181818",color:"#fff"},check:{display:"flex",gap:10,alignItems:"center",marginTop:14,color:"#ccc"},primary:{width:"100%",marginTop:18,padding:15,border:0,borderRadius:12,background:"#fe2c55",color:"#fff",fontWeight:900,fontSize:16},error:{color:"#ff6b7f",fontSize:13}};
