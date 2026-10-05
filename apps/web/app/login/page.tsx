"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method,setMethod]=useState<"phone"|"email"|"username">("email");
  const [identifier,setIdentifier]=useState("");
  const [password,setPassword]=useState("");
  const [countryCode,setCountryCode]=useState("GH");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response=await fetch(API+"/auth/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:identifier.trim(),password,countryCode})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok || !data.token) throw new Error(data.error ?? "Unable to sign in");
      localStorage.setItem("twitok_user_token",data.token);
      const next = searchParams.get("next");
      const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : (data.user?.profileSetupComplete===false?"/profile-setup":"/");
      router.replace(destination);
    } catch(e) { setError(e instanceof Error?e.message:"Unable to sign in"); }
    finally { setBusy(false); }
  }

  return <main style={styles.page}><form onSubmit={submit} style={styles.card}>
    <Link href="/" style={styles.back}>← TwiTok</Link>
    <h1>Sign in</h1><p style={styles.muted}>Sign in to your TwiTok account.</p>
    <div style={styles.tabs}>{(["email","phone","username"] as const).map(item=><button type="button" key={item} onClick={()=>setMethod(item)} style={method===item?styles.tabActive:styles.tab}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
    {method==="phone" ? <div style={{display:"grid",gridTemplateColumns:"90px 1fr",gap:8}}><input value={countryCode} onChange={e=>setCountryCode(e.target.value.toUpperCase())} maxLength={3} style={styles.input} placeholder="GH"/><input value={identifier} onChange={e=>setIdentifier(e.target.value)} style={styles.input} placeholder="Phone number" required/></div> : <input value={identifier} onChange={e=>setIdentifier(e.target.value)} style={styles.input} placeholder={method==="email"?"Email address":"Username"} required autoCapitalize="none"/>}
    <input value={password} onChange={e=>setPassword(e.target.value)} style={styles.input} placeholder="Password" type="password" required minLength={8}/>
    {error?<p style={styles.error}>{error}</p>:null}
    <button disabled={busy} style={styles.primary}>{busy?"Signing in…":"Sign in"}</button>
    <p style={styles.bottom}>Don't have an account? <Link href="/register" style={styles.link}>Sign up</Link></p>
  </form></main>;
}
const styles:Record<string,CSSProperties>={page:{minHeight:"100vh",background:"#000",color:"#fff",display:"grid",placeItems:"center",padding:24},card:{width:"100%",maxWidth:460,background:"#111",border:"1px solid #292929",borderRadius:24,padding:32,boxShadow:"0 20px 80px rgba(0,0,0,.5)"},back:{color:"#25f4ee",textDecoration:"none"},h1:{fontSize:36},muted:{color:"#999",lineHeight:1.6},tabs:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,margin:"20px 0 10px"},tab:{background:"#1b1b1b",color:"#aaa",border:"1px solid #333",padding:11,borderRadius:10},tabActive:{background:"#fff",color:"#000",border:"1px solid #fff",padding:11,borderRadius:10},input:{width:"100%",boxSizing:"border-box",marginTop:10,padding:"14px 15px",borderRadius:12,border:"1px solid #333",background:"#181818",color:"#fff",outline:"none"},primary:{width:"100%",marginTop:16,padding:15,border:0,borderRadius:12,background:"#fe2c55",color:"#fff",fontWeight:900,fontSize:16},error:{color:"#ff6b7f",fontSize:13},bottom:{textAlign:"center",color:"#999",marginTop:20},link:{color:"#25f4ee",fontWeight:900}};
