"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CountryCodePicker from "../../components/CountryCodePicker";
import { TWITOK_COUNTRIES } from "@twitok/types";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "https://twitok-api-sfig.onrender.com/api/v1";

function GoogleLogo(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.35 12.23c0-.7-.06-1.36-.18-2H12v3.79h5.23a4.47 4.47 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.92-4.18 2.92-7.18z"/><path fill="#34A853" d="M12 21.82c2.63 0 4.83-.87 6.43-2.36l-3.14-2.45c-.87.58-1.98.92-3.29.92-2.53 0-4.67-1.71-5.44-4.01H3.31v2.53A9.7 9.7 0 0 0 12 21.82z"/><path fill="#FBBC05" d="M6.56 13.92A5.84 5.84 0 0 1 6.25 12c0-.67.11-1.32.31-1.92V7.55H3.31A9.76 9.76 0 0 0 2.25 12c0 1.57.38 3.05 1.06 4.45l3.25-2.53z"/><path fill="#EA4335" d="M12 6.07c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.82 3.13 14.62 2.18 12 2.18a9.7 9.7 0 0 0-8.69 5.37l3.25 2.53C7.33 7.78 9.47 6.07 12 6.07z"/></svg>;}
function AppleLogo(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.73 12.72c.02 2.09 1.83 2.79 1.85 2.8-.02.05-.29.98-.96 1.94-.58.84-1.18 1.67-2.12 1.69-.93.02-1.23-.55-2.3-.55-1.07 0-1.4.53-2.28.57-.92.03-1.62-.9-2.2-1.74-1.2-1.74-2.12-4.93-.89-7.06.61-1.05 1.61-1.72 2.69-1.74.85-.02 1.65.59 2.3.59.65 0 1.87-.73 3.15-.62.53.02 2.03.21 2.99 1.57-.08.05-1.79 1.05-1.77 2.55zM14.7 5.34c.58-.71.97-1.69.87-2.67-.84.03-1.85.56-2.45 1.27-.53.61-.99 1.59-.87 2.54.94.07 1.87-.43 2.45-1.14z"/></svg>;}
function FacebookLogo(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.57-4.7 1.32 0 2.7.24 2.7.24v2.98h-1.52c-1.5 0-1.97.94-1.97 1.9v2.29h3.35l-.54 3.49h-2.81V24C19.61 23.07 24 18.09 24 12.07z"/></svg>;}
function QrIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 21h3"/></svg>;}

export default function LoginPage(){
 const router=useRouter(); const searchParams=useSearchParams();
 const [method,setMethod]=useState<"phone"|"email"|"username">("phone"); const [identifier,setIdentifier]=useState(""); const [password,setPassword]=useState(""); const [countryCode,setCountryCode]=useState("GH"); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 const country=TWITOK_COUNTRIES.find(item=>item.alpha2===countryCode); const countryName=country?.name??"your country";
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{const r=await fetch(API+"/auth/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:identifier.trim(),password,countryCode})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error(d.error??"Unable to sign in");localStorage.setItem("twitok_user_token",d.token);const next=searchParams.get("next");router.replace(next&&next.startsWith("/")&&!next.startsWith("//")?next:(d.user?.profileSetupComplete===false?"/profile-setup":"/"));}catch(e){setError(e instanceof Error?e.message:"Unable to sign in")}finally{setBusy(false)}}
 function beginQrLogin(){setError("QR code login is not available yet. For your security, no QR login attempt has been started.");}
 function provider(name:string){setError(name+" sign-in will open when the provider connection is configured.");}
 return <main style={styles.page}><div style={styles.card}><Link href="/" style={styles.back}>← TwiTok</Link><h1>Sign in</h1><p style={styles.muted}>Sign in to your TwiTok account.</p>
 <button type="button" onClick={beginQrLogin} style={styles.qrButton}><QrIcon/> <span>Sign in with QR code</span></button>
 <div style={styles.tabs}>{(["email","phone","username"] as const).map(item=><button type="button" key={item} onClick={()=>setMethod(item)} style={method===item?styles.tabActive:styles.tab}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
 {method==="phone" ? (
   <div style={styles.phoneRow}>
     <CountryCodePicker value={countryCode} onChange={setCountryCode}/>
     <input value={identifier} onChange={e=>setIdentifier(e.target.value.replace(/[^0-9+\s().-]/g,""))} style={styles.input} placeholder="Phone number" type="tel" inputMode="tel" required autoComplete="tel"/>
   </div>
 ) : (
   <input value={identifier} onChange={e=>setIdentifier(e.target.value)} style={styles.input} placeholder={method==="email"?"Email address":"Username"} required autoCapitalize="none" autoComplete={method==="email"?"email":"username"}/>
 )}
 <input value={password} onChange={e=>setPassword(e.target.value)} style={styles.input} placeholder="Password" type="password" required minLength={8}/>
 {error?<p style={styles.error} role="alert">{error}</p>:null}<div className="kente-button-wrap"><button onClick={submit} disabled={busy} className="auth-primary" style={styles.primary}>{busy?"Signing in…":"Sign in"}</button></div>
 <div style={styles.divider}><span>or continue with</span></div>
 <div style={styles.providerStack}>{[["Google",GoogleLogo],["Apple",AppleLogo],["Facebook",FacebookLogo]].map(([name,Logo])=><button type="button" key={name as string} onClick={()=>provider(name as string)} style={styles.providerButton}><Logo/><span>Continue with {name as string}</span></button>)}</div>
 <div style={styles.legal}>Continuing with an account located in {countryName} means you agree to our <Link href="/terms" style={styles.link}>Terms of Service</Link> and acknowledge that you have read our <Link href="/privacy" style={styles.link}>Privacy Policy</Link>.</div>
 <div style={styles.helpRow}><Link href="/feedback" style={styles.link}>? Feedback and Help</Link></div><div className="kente-button-wrap auth-signup-wrap"><Link href="/register" className="auth-signup-primary" style={styles.signupButton}>Sign up</Link></div>
 </div></main>;
}
const styles:Record<string,CSSProperties>={page:{minHeight:"100vh",background:"#000",color:"#fff",display:"grid",placeItems:"center",padding:24},card:{width:"100%",maxWidth:460,background:"#111",border:"1px solid #292929",borderRadius:24,padding:32,boxShadow:"0 20px 80px rgba(0,0,0,.5)"},back:{color:"#25f4ee",textDecoration:"none"},muted:{color:"#999",lineHeight:1.6},tabs:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,margin:"20px 0 10px"},tab:{background:"#1b1b1b",color:"#aaa",border:"1px solid #333",padding:11,borderRadius:10},tabActive:{background:"#fff",color:"#000",border:"1px solid #fff",padding:11,borderRadius:10},phoneRow:{display:"grid",gridTemplateColumns:"132px 1fr",gap:8},input:{width:"100%",boxSizing:"border-box",marginTop:10,padding:"14px 15px",borderRadius:12,border:"1px solid #333",background:"#181818",color:"#fff",outline:"none"},qrButton:{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:18,padding:"13px 15px",borderRadius:12,border:"1px solid #333",background:"#181818",color:"#fff",fontWeight:900,cursor:"pointer"},primary:{width:"100%",padding:13,border:0,borderRadius:10,background:"#25f4ee",color:"#000",fontWeight:900,fontSize:16},error:{color:"#ff6b7f",fontSize:13},divider:{display:"flex",alignItems:"center",gap:10,margin:"22px 0 12px",color:"#777",fontSize:12},providerStack:{display:"grid",gap:8},providerButton:{width:"100%",minHeight:48,display:"flex",alignItems:"center",justifyContent:"center",gap:10,border:"1px solid #333",background:"#fff",color:"#111",padding:"12px 14px",borderRadius:12,fontWeight:900,cursor:"pointer"},legal:{color:"#777",fontSize:12,lineHeight:1.55,textAlign:"center",marginTop:18},link:{color:"#25f4ee",fontWeight:800,textDecoration:"none"},helpRow:{textAlign:"center",marginTop:16},signupButton:{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",minHeight:52,boxSizing:"border-box",borderRadius:15,textDecoration:"none",fontWeight:900,fontSize:17}};